#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

function parseArgs(argv) {
  const args = { session: null, repo: process.cwd(), out: null, limit: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") args.session = argv[++i];
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  return `Usage: node skills/pi-edit-session-report/scripts/session-report.mjs --session <file-or-dir> [--repo .] [--out report.md] [--limit 50]`;
}

function listJsonl(input, limit) {
  const stat = fs.statSync(input);
  if (stat.isFile()) return [input];
  const out = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith(".jsonl")) out.push(p);
    }
  }
  walk(input);
  out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return out.slice(0, limit);
}

function textContent(content) {
  return (content || []).map((c) => c.text || "").join("\n");
}

function emptyStats() {
  return {
    sessions: 0,
    messages: 0,
    toolCalls: 0,
    toolResults: 0,
    toolInputChars: 0,
    toolResultChars: 0,
    byTool: {},
    errors: [],
    builtInEditCalls: [],
    replacementEditCalls: [],
    broadReads: [],
    hashlineRejections: [],
  };
}

function ensureTool(stats, tool) {
  stats.byTool[tool] ??= { calls: 0, results: 0, inputChars: 0, resultChars: 0, errors: 0 };
  return stats.byTool[tool];
}

function analyzeSession(file, stats) {
  const session = { file, cwd: null, timestamp: null, tools: {} };
  const lines = fs.readFileSync(file, "utf8").split(/\n+/).filter(Boolean);
  stats.sessions++;
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type === "session") {
      session.cwd = rec.cwd;
      session.timestamp = rec.timestamp;
    }
    if (rec.type !== "message" || !rec.message) continue;
    stats.messages++;
    const msg = rec.message;
    if (msg.role === "assistant") {
      for (const c of msg.content || []) {
        if (c.type !== "toolCall") continue;
        const tool = c.name || "unknown";
        const inputChars = JSON.stringify(c.arguments || {}).length;
        stats.toolCalls++;
        stats.toolInputChars += inputChars;
        const t = ensureTool(stats, tool);
        t.calls++;
        t.inputChars += inputChars;
        session.tools[tool] = (session.tools[tool] || 0) + 1;
        if (tool === "edit") stats.builtInEditCalls.push({ file, args: c.arguments });
        if (["edit_tagged", "edit_hashline_range", "edit_hashline_patch", "edit_codex_patch", "edit_crc_range"].includes(tool)) {
          stats.replacementEditCalls.push({ file, tool, args: c.arguments });
        }
      }
    }
    if (msg.role === "toolResult") {
      const tool = msg.toolName || "unknown";
      const result = textContent(msg.content);
      const resultChars = result.length;
      stats.toolResults++;
      stats.toolResultChars += resultChars;
      const t = ensureTool(stats, tool);
      t.results++;
      t.resultChars += resultChars;
      if (msg.isError) {
        t.errors++;
        const err = { file, tool, result: result.slice(0, 500) };
        stats.errors.push(err);
        if (tool.startsWith("edit_hashline")) stats.hashlineRejections.push(err);
      }
      if ((tool.startsWith("read") || tool === "search_hashline") && resultChars > 2500) {
        stats.broadReads.push({ file, tool, resultChars, preview: result.slice(0, 120).replace(/\n/g, "\\n") });
      }
    }
  }
  return session;
}

function pct(n, d) { return d ? `${((n / d) * 100).toFixed(1)}%` : "-"; }
function mdEscape(s) { return String(s).replace(/\|/g, "\\|").replace(/\n/g, "<br>"); }

function buildRecommendations(stats) {
  const recs = [];
  const editCalls = stats.builtInEditCalls.length;
  if (editCalls > 0) recs.push(`Built-in \`edit\` appeared ${editCalls} time(s). For replacement-policy sessions, remove built-in \`edit\` from --tools or strengthen the prompt.`);
  if (stats.broadReads.length > 0) recs.push(`Detected ${stats.broadReads.length} broad read result(s) over 2500 chars. Add/strengthen relevant-file hints or narrower search/read workflows.`);
  if (stats.hashlineRejections.length > 0) recs.push(`Detected ${stats.hashlineRejections.length} hashline rejection/error(s). Check whether fallback to tagged occurred and improve rejection diagnostics if not.`);
  const tagged = stats.byTool.edit_tagged?.calls || 0;
  const hashline = stats.byTool.edit_hashline_range?.calls || 0;
  if (hashline > tagged * 2 && stats.broadReads.length > 0) recs.push("Hashline edits dominate and broad reads are present. Consider tagged-default routing or task-level preferredEditPath only for large/safety-sensitive edits.");
  if (tagged === 0 && hashline === 0 && stats.replacementEditCalls.length === 0) recs.push("No replacement edit calls were observed. Verify the session actually used this extension and that built-in edit was disabled.");
  if (stats.errors.length === 0) recs.push("No tool errors were observed. Focus next on reducing session I/O and improving routing rather than error recovery.");
  return recs;
}

function buildReport({ files, sessions, stats }) {
  const totalIo = stats.toolInputChars + stats.toolResultChars;
  const toolRows = Object.entries(stats.byTool)
    .sort((a, b) => (b[1].inputChars + b[1].resultChars) - (a[1].inputChars + a[1].resultChars))
    .map(([tool, s]) => `| ${tool} | ${s.calls} | ${s.results} | ${s.inputChars} | ${s.resultChars} | ${s.inputChars + s.resultChars} | ${s.errors} |`)
    .join("\n");
  const recs = buildRecommendations(stats);
  const broad = stats.broadReads.slice(0, 20).map((r) => `| ${path.basename(r.file)} | ${r.tool} | ${r.resultChars} | ${mdEscape(r.preview)} |`).join("\n") || "| - | - | - | - |";
  const errors = stats.errors.slice(0, 20).map((e) => `| ${path.basename(e.file)} | ${e.tool} | ${mdEscape(e.result)} |`).join("\n") || "| - | - | - |";

  return `# Pi edit extension session improvement report

Generated: ${new Date().toISOString()}

## Inputs

${files.map((f) => `- ${f}`).join("\n")}

## Summary

| metric | value |
| --- | ---: |
| sessions | ${stats.sessions} |
| messages | ${stats.messages} |
| tool calls | ${stats.toolCalls} |
| tool results | ${stats.toolResults} |
| tool input chars | ${stats.toolInputChars} |
| tool result chars | ${stats.toolResultChars} |
| total tool I/O chars | ${totalIo} |
| built-in edit calls | ${stats.builtInEditCalls.length} |
| replacement edit calls | ${stats.replacementEditCalls.length} |
| tool errors | ${stats.errors.length} |
| broad reads >2500 chars | ${stats.broadReads.length} |

## Tool usage

| tool | calls | results | input chars | result chars | total I/O | errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${toolRows || "| - | - | - | - | - | - | - |"}

## Extension-specific signals

| signal | count |
| --- | ---: |
| built-in edit calls | ${stats.builtInEditCalls.length} |
| edit_tagged calls | ${stats.byTool.edit_tagged?.calls || 0} |
| edit_hashline_range calls | ${stats.byTool.edit_hashline_range?.calls || 0} |
| read_tagged calls | ${stats.byTool.read_tagged?.calls || 0} |
| read_hashline calls | ${stats.byTool.read_hashline?.calls || 0} |
| hashline rejections/errors | ${stats.hashlineRejections.length} |

## Broad reads

| session | tool | result chars | preview |
| --- | --- | ---: | --- |
${broad}

## Tool errors

| session | tool | result |
| --- | --- | --- |
${errors}

## Recommendations

${recs.map((r) => `- ${r}`).join("\n")}

## Suggested next actions

- If built-in \`edit\` appears, rerun with the recommended extension policy that omits built-in \`edit\`.
- If broad reads dominate, add relevant-file hints or use targeted search/read flows.
- If hashline is overused for simple edits, prefer tagged by default and opt into hashline via task-level preference.
- If hashline errors appear, inspect whether tagged fallback occurred and improve diagnostics/prompts.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.session) {
    console.log(usage());
    return;
  }
  const repo = path.resolve(args.repo);
  const files = listJsonl(path.resolve(args.session), args.limit);
  const stats = emptyStats();
  const sessions = files.map((f) => analyzeSession(f, stats));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.resolve(repo, args.out || path.join("docs", "session-improvement-reports", `session-improvement-${stamp}.md`));
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, buildReport({ files, sessions, stats }));
  console.log(out);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
