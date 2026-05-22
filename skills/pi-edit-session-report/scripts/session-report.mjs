#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

function parseArgs(argv) {
  const args = { session: null, repo: process.cwd(), out: null, limit: 50, broadThreshold: 2500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") args.session = argv[++i];
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--broad-threshold") args.broadThreshold = Number(argv[++i]);
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  return "Usage: node skills/pi-edit-session-report/scripts/session-report.mjs --session <file-or-dir> [--repo .] [--out report.md] [--limit 50] [--broad-threshold 2500]";
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

function mdEscape(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function inc(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

function classifyError(tool, text) {
  if (tool === "bash") {
    if (/^pi - AI coding assistant|Usage:\n\s*pi \[options\]/i.test(text)) return "bash_pi_usage";
    if (/Permission denied/i.test(text)) return "bash_permission_denied";
    if (/command not found|No such file or directory/i.test(text)) return "bash_command_not_found";
    if (/ModuleNotFoundError|Missing dependency|No module named|pip install/i.test(text)) return "bash_dependency";
    if (/xcodebuild|SwiftCompile|Ld |BUILD FAILED|Test Suite|failed:/i.test(text)) return "bash_build_test";
    if (/Command timed out/i.test(text)) return "bash_timeout";
    if (/Address already in use|server exited|ThreadingHTTPServer|HTTPServer/i.test(text)) return "bash_server";
    return "bash_other";
  }
  if (tool === "edit_tagged") {
    if (/tag mismatch/i.test(text)) return "edit_tag_mismatch";
    return "edit_tagged_error";
  }
  if (tool?.startsWith("edit_hashline")) {
    if (/anchors did not match|anchor/i.test(text)) return "hashline_anchor_mismatch";
    if (/Expected range|patch/i.test(text)) return "hashline_patch_syntax";
    return "hashline_error";
  }
  if (tool === "edit") return "built_in_edit_error";
  if (tool === "read") return "read_error";
  return `${tool || "unknown"}_error`;
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
    bySession: [],
    errors: [],
    errorCategories: {},
    builtInEditCalls: [],
    replacementEditCalls: [],
    broadReads: [],
    broadReadsByPath: {},
    hashlineRejections: [],
    hashlineFallbacks: 0,
  };
}

function ensureTool(container, tool) {
  container[tool] ??= { calls: 0, results: 0, inputChars: 0, resultChars: 0, errors: 0 };
  return container[tool];
}

function recordCall(stats, session, event, tool, args) {
  const inputChars = JSON.stringify(args || {}).length;
  stats.toolCalls++;
  stats.toolInputChars += inputChars;
  const t = ensureTool(stats.byTool, tool);
  t.calls++;
  t.inputChars += inputChars;
  const st = ensureTool(session.byTool, tool);
  st.calls++;
  st.inputChars += inputChars;
  session.toolCalls++;
  session.toolInputChars += inputChars;
  session.events.push({ kind: "call", tool, args });

  if (tool === "edit") {
    const rec = { file: session.file, args };
    stats.builtInEditCalls.push(rec);
    session.builtInEditCalls++;
  }
  if (["edit_tagged", "edit_hashline_range", "edit_hashline_patch", "edit_codex_patch", "edit_crc_range"].includes(tool)) {
    stats.replacementEditCalls.push({ file: session.file, tool, args });
    session.replacementEditCalls++;
  }
}

function recordResult(stats, session, tool, result, isError, threshold) {
  const resultChars = result.length;
  stats.toolResults++;
  stats.toolResultChars += resultChars;
  const t = ensureTool(stats.byTool, tool);
  t.results++;
  t.resultChars += resultChars;
  const st = ensureTool(session.byTool, tool);
  st.results++;
  st.resultChars += resultChars;
  session.toolResults++;
  session.toolResultChars += resultChars;

  const evt = { kind: "result", tool, isError, result: result.slice(0, 500), resultChars };
  session.events.push(evt);

  if (isError) {
    t.errors++;
    st.errors++;
    const category = classifyError(tool, result);
    const err = { file: session.file, tool, category, result: result.slice(0, 500) };
    stats.errors.push(err);
    session.errors.push(err);
    inc(stats.errorCategories, category);
    inc(session.errorCategories, category);
    if (tool.startsWith("edit_hashline")) {
      stats.hashlineRejections.push(err);
      session.hashlineRejections++;
    }
  }

  if ((tool.startsWith("read") || tool === "search_hashline") && resultChars > threshold) {
    const rec = { file: session.file, tool, resultChars, preview: result.slice(0, 120).replace(/\n/g, "\\n") };
    stats.broadReads.push(rec);
    session.broadReads++;
    inc(stats.broadReadsByPath, `${tool}`);
  }
}

function computeFallbacks(stats, session) {
  for (let i = 0; i < session.events.length; i++) {
    const e = session.events[i];
    if (!(e.kind === "result" && e.isError && e.tool.startsWith("edit_hashline"))) continue;
    const window = session.events.slice(i + 1, i + 25).filter((x) => x.kind === "call");
    if (window.some((x) => x.tool === "edit_tagged")) {
      stats.hashlineFallbacks++;
      session.hashlineFallbacks++;
    }
  }
}

function analyzeSession(file, stats, threshold) {
  const session = {
    file,
    cwd: null,
    timestamp: null,
    messages: 0,
    toolCalls: 0,
    toolResults: 0,
    toolInputChars: 0,
    toolResultChars: 0,
    byTool: {},
    errors: [],
    errorCategories: {},
    builtInEditCalls: 0,
    replacementEditCalls: 0,
    broadReads: 0,
    hashlineRejections: 0,
    hashlineFallbacks: 0,
    events: [],
  };
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
    session.messages++;
    const msg = rec.message;
    if (msg.role === "assistant") {
      for (const c of msg.content || []) {
        if (c.type === "toolCall") recordCall(stats, session, c, c.name || "unknown", c.arguments || {});
      }
    } else if (msg.role === "toolResult") {
      recordResult(stats, session, msg.toolName || "unknown", textContent(msg.content), Boolean(msg.isError), threshold);
    }
  }
  computeFallbacks(stats, session);
  stats.bySession.push(session);
  return session;
}

function buildRecommendations(stats) {
  const recs = [];
  const currentBuiltIn = stats.bySession.filter((s) => s.replacementEditCalls > 0 && s.builtInEditCalls > 0).reduce((n, s) => n + s.builtInEditCalls, 0);
  const legacyBuiltIn = stats.builtInEditCalls.length - currentBuiltIn;
  if (currentBuiltIn > 0) recs.push(`Built-in \`edit\` appeared ${currentBuiltIn} time(s) in sessions that also used replacement tools. Omit built-in \`edit\` from --tools for replacement-policy runs.`);
  if (legacyBuiltIn > 0) recs.push(`Built-in \`edit\` appeared ${legacyBuiltIn} time(s) in sessions without replacement edits. Treat these as legacy/baseline sessions, not current policy failures.`);
  if (stats.broadReads.length > 0) recs.push(`Detected ${stats.broadReads.length} broad read result(s). Add relevant-file hints, use offset/limit reads, or prefer search_hashline for locating targets.`);
  if (stats.hashlineRejections.length > 0) recs.push(`Detected ${stats.hashlineRejections.length} hashline rejection/error(s); ${stats.hashlineFallbacks} had tagged fallback within the next 25 events. Improve fallback prompts/diagnostics where fallback is missing.`);
  if ((stats.errorCategories.bash_timeout || 0) > 0 || (stats.errorCategories.bash_server || 0) > 0) recs.push("Bash errors include timeouts/server failures. Separate build/test/server commands in reports so edit-tool issues are not mixed with environment issues.");
  if ((stats.errorCategories.edit_tag_mismatch || 0) > 0) recs.push("Tagged tag mismatches occurred. Re-read the target lines before retrying and avoid batching stale edits across long sessions.");
  if (stats.errors.length === 0) recs.push("No tool errors were observed. Focus next on reducing session I/O and improving routing.");
  return recs;
}

function rowsFromCounts(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${mdEscape(k)} | ${v} |`).join("\n") || "| - | - |";
}

function buildReport({ files, stats }) {
  const totalIo = stats.toolInputChars + stats.toolResultChars;
  const toolRows = Object.entries(stats.byTool)
    .sort((a, b) => (b[1].inputChars + b[1].resultChars) - (a[1].inputChars + a[1].resultChars))
    .map(([tool, s]) => `| ${tool} | ${s.calls} | ${s.results} | ${s.inputChars} | ${s.resultChars} | ${s.inputChars + s.resultChars} | ${s.errors} |`)
    .join("\n") || "| - | - | - | - | - | - | - |";
  const sessionRows = stats.bySession.map((s) => `| ${path.basename(s.file)} | ${s.toolCalls} | ${s.toolInputChars + s.toolResultChars} | ${s.builtInEditCalls} | ${s.replacementEditCalls} | ${s.broadReads} | ${s.errors.length} | ${s.hashlineRejections} | ${s.hashlineFallbacks} |`).join("\n") || "| - | - | - | - | - | - | - | - | - |";
  const broad = stats.broadReads.slice(0, 30).map((r) => `| ${path.basename(r.file)} | ${r.tool} | ${r.resultChars} | ${mdEscape(r.preview)} |`).join("\n") || "| - | - | - | - |";
  const errors = stats.errors.slice(0, 30).map((e) => `| ${path.basename(e.file)} | ${e.tool} | ${e.category} | ${mdEscape(e.result)} |`).join("\n") || "| - | - | - | - |";
  const recs = buildRecommendations(stats);

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
| broad reads > threshold | ${stats.broadReads.length} |
| hashline rejections/errors | ${stats.hashlineRejections.length} |
| hashline -> tagged fallbacks | ${stats.hashlineFallbacks} |

## Per-session summary

| session | calls | total I/O | built-in edit | replacement edits | broad reads | errors | hashline rejects | hashline->tagged fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${sessionRows}

## Tool usage

| tool | calls | results | input chars | result chars | total I/O | errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${toolRows}

## Error categories

| category | count |
| --- | ---: |
${rowsFromCounts(stats.errorCategories)}

## Extension-specific signals

| signal | count |
| --- | ---: |
| built-in edit calls | ${stats.builtInEditCalls.length} |
| replacement edit calls | ${stats.replacementEditCalls.length} |
| edit_tagged calls | ${stats.byTool.edit_tagged?.calls || 0} |
| edit_hashline_range calls | ${stats.byTool.edit_hashline_range?.calls || 0} |
| read_tagged calls | ${stats.byTool.read_tagged?.calls || 0} |
| read_hashline calls | ${stats.byTool.read_hashline?.calls || 0} |
| search_hashline calls | ${stats.byTool.search_hashline?.calls || 0} |
| hashline rejections/errors | ${stats.hashlineRejections.length} |
| hashline -> tagged fallbacks | ${stats.hashlineFallbacks} |

## Broad reads

| session | tool | result chars | preview |
| --- | --- | ---: | --- |
${broad}

## Tool errors

| session | tool | category | result |
| --- | --- | --- | --- |
${errors}

## Recommendations

${recs.map((r) => `- ${r}`).join("\n")}

## Suggested next actions

- For replacement-policy runs, omit built-in \`edit\` from --tools.
- Add likely-relevant file hints before editing.
- Prefer tagged edits for simple edits; opt into hashline for safety-sensitive or repeated-file edits.
- After hashline rejection, re-read the shown area or fall back to tagged.
- Treat bash build/test/server failures separately from edit-tool failures.
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
  for (const f of files) analyzeSession(f, stats, args.broadThreshold);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.resolve(repo, args.out || path.join("docs", "session-improvement-reports", `session-improvement-${stamp}.md`));
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await fsp.writeFile(out, buildReport({ files, stats }));
  console.log(out);
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
