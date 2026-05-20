#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPlan } from "./plan.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EXT = path.join(ROOT, "src/index.ts");

function parseArgs(argv) {
  const args = {
    out: path.join(ROOT, ".natural-runs", new Date().toISOString().replace(/[:.]/g, "-")),
    modes: ["pi_edit", "tagged", "codex_patch", "hashline_legacy", "hashline", "hashline_range", "crc"],
    timeout: 180,
    task: null,
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--modes") args.modes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--task") args.task = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function slug(s) { return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }

function expectedText(fixture, scenario) {
  const lines = fixture.replace(/\r\n/g, "\n").split("\n");
  const finalEmpty = lines.at(-1) === "";
  if (finalEmpty) lines.pop();
  const repl = scenario.payloads.pi_edit.edits[0].newText;
  const replacement = repl.length ? repl.replace(/\r\n/g, "\n").split("\n") : [];
  lines.splice(scenario.start - 1, scenario.end - scenario.start + 1, ...replacement);
  return lines.join("\n") + (finalEmpty ? "\n" : "");
}

function desiredText(scenario) {
  return scenario.payloads.pi_edit.edits[0].newText;
}

function promptFor(mode, scenario) {
  const replacement = desiredText(scenario);
  const intent = replacement.length
    ? `Replace original lines ${scenario.start}-${scenario.end} with exactly this text:\n\n${replacement}\n`
    : `Delete original lines ${scenario.start}-${scenario.end}.\n`;
  const common = `You are editing fixture.ts in this directory.\nScenario: ${scenario.name}\n${intent}\nDo not make unrelated changes. Inspect the file as needed and construct the edit tool payload yourself. Do not use a precomputed patch from the prompt.\n`;
  if (mode === "pi_edit") return common + "Use only the built-in read and edit tools.\n";
  if (mode === "tagged") return common + "Use only read_tagged and edit_tagged. Read the relevant lines first, then edit using returned tags.\n";
  if (mode === "codex_patch") return common + "Use only read and edit_codex_patch. Read enough context, then write a Codex apply_patch-style patch.\n";
  if (mode === "hashline_legacy") return common + "Use only read_hashline_legacy and edit_hashline_patch_legacy. Read the relevant anchors first, then edit.\n";
  if (mode === "hashline") return common + "Use only read_hashline and edit_hashline_patch. Preserve any strict :tag anchors returned by read_hashline. If an edit is rejected for strict anchors, re-read and retry once.\n";
  if (mode === "hashline_range") return common + "Use only read_hashline and edit_hashline_range. Read the relevant anchors first. Copy start/end anchors exactly, including :tag when present. Use newText as the full replacement text; empty newText deletes the range.\n";
  if (mode === "crc") return common + "Use only read_tagged and edit_crc_range. Read the file metadata to obtain fileCrc32, then edit the requested line range.\n";
  throw new Error(`Unsupported mode ${mode}`);
}

function commandFor(mode, promptFile) {
  const basePi = ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "-p", `@${path.basename(promptFile)}`];
  if (mode === "pi_edit") return { cmd: "pi", args: [...basePi, "--tools", "read,edit"] };
  if (mode === "tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_tagged"] };
  if (mode === "codex_patch") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,edit_codex_patch"] };
  if (mode === "hashline_legacy") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline_legacy,edit_hashline_patch_legacy"] };
  if (mode === "hashline") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_patch"] };
  if (mode === "hashline_range") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_range"] };
  if (mode === "crc") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_crc_range"] };
  throw new Error(mode);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node bench/natural-runner.mjs [--out DIR] [--modes pi_edit,tagged,codex_patch,hashline_legacy,hashline,hashline_range,crc] [--task NAME] [--limit N] [--timeout SEC]");
    return;
  }
  const plan = buildPlan();
  let scenarios = plan.scenarios;
  if (args.task) scenarios = scenarios.filter((s) => s.name === args.task || slug(s.name) === args.task);
  if (args.limit) scenarios = scenarios.slice(0, args.limit);
  await fsp.mkdir(args.out, { recursive: true });
  await fsp.writeFile(path.join(args.out, "plan.json"), JSON.stringify({ ...plan, scenarios }, null, 2));
  const results = [];

  for (const scenario of scenarios) {
    for (const mode of args.modes) {
      const dir = path.join(args.out, "runs", mode, slug(scenario.name));
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, "fixture.ts"), plan.fixture.text);
      const promptFile = path.join(dir, "prompt.md");
      await fsp.writeFile(promptFile, promptFor(mode, scenario));
      const metricsPath = path.join(dir, "metrics.jsonl");
      const { cmd, args: cmdArgs } = commandFor(mode, promptFile);
      const started = Date.now();
      const res = spawnSync(cmd, cmdArgs, {
        cwd: dir,
        timeout: args.timeout * 1000,
        encoding: "utf8",
        env: { ...process.env, PI_TAGGED_EDIT_METRICS: metricsPath },
      });
      const durationMs = Date.now() - started;
      const finalText = fs.existsSync(path.join(dir, "fixture.ts")) ? fs.readFileSync(path.join(dir, "fixture.ts"), "utf8") : "";
      const expected = expectedText(plan.fixture.text, scenario);
      const ok = res.status === 0 && finalText === expected;
      const metricRecords = fs.existsSync(metricsPath)
        ? fs.readFileSync(metricsPath, "utf8").split(/\n+/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
        : [];
      const record = {
        mode,
        scenario: scenario.name,
        status: res.status,
        signal: res.signal,
        duration_ms: durationMs,
        success: ok,
        stdout_tail: (res.stdout || "").split("\n").slice(-20).join("\n"),
        stderr_tail: (res.stderr || "").split("\n").slice(-20).join("\n"),
        dir,
        toolMetrics: metricRecords,
      };
      results.push(record);
      await fsp.writeFile(path.join(dir, "result.json"), JSON.stringify(record, null, 2));
      console.log(JSON.stringify(record));
    }
  }

  const summary = {};
  for (const r of results) {
    summary[r.mode] ??= { total: 0, success: 0, duration_ms: 0 };
    summary[r.mode].total++;
    if (r.success) summary[r.mode].success++;
    summary[r.mode].duration_ms += r.duration_ms;
  }
  for (const s of Object.values(summary)) s.avg_duration_ms = Math.round(s.duration_ms / s.total);
  await fsp.writeFile(path.join(args.out, "actual-results.json"), JSON.stringify({ summary, results }, null, 2));
  const allMetrics = results.flatMap((r) => (r.toolMetrics || []).map((m) => ({ ...m, mode: r.mode, scenario: r.scenario })));
  if (allMetrics.length) await fsp.writeFile(path.join(args.out, "this-extension.metrics.jsonl"), allMetrics.map((m) => JSON.stringify(m)).join("\n") + "\n");
  console.log(JSON.stringify({ out: args.out, summary }, null, 2));
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
