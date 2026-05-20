#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { formatHashlineAnchor, strictHashlineTag } from "../src/core.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EXT = path.join(ROOT, "src/index.ts");

function parseArgs(argv) {
  const args = { out: path.join(ROOT, ".fallback-agent-runs", new Date().toISOString().replace(/[:.]/g, "-")), timeout: 180, task: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--task") args.task = argv[++i];
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

const staleOld = "collision candidate 8";
const staleCurrent = "collision candidate 35";
const stalePlain = formatHashlineAnchor(1, staleOld);
const staleStrict = `${stalePlain}:${strictHashlineTag(staleOld)}`;

const destructiveText = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
const destructiveA = formatHashlineAnchor(1, "line 1");
const destructiveB = formatHashlineAnchor(25, "line 25");

const tasks = [
  {
    id: "stale-strict-then-tagged",
    fileText: `${staleCurrent}\n`,
    expected: "patched\n",
    prompt: `You are editing fixture.txt. This is a fallback-behavior benchmark. Your first tool call MUST be edit_hashline_range with exactly these arguments, even though it is expected to be rejected:\n\npath: fixture.txt\nstart: ${staleStrict}\nend: ${staleStrict}\nnewText: patched\n\nDo not call read_tagged before this first edit_hashline_range call. After the hashline edit is rejected, recover by using read_tagged and edit_tagged against the current file. The final file must contain exactly:\n\npatched\n`,
  },
  {
    id: "plain-destructive-then-tagged",
    fileText: destructiveText,
    expected: "\n",
    prompt: `You are editing fixture.txt. This is a fallback-behavior benchmark. Your first tool call MUST be edit_hashline_range with exactly these arguments, even though it is expected to be rejected:\n\npath: fixture.txt\nstart: ${destructiveA}\nend: ${destructiveB}\nnewText: <empty string>\n\nDo not call read_tagged before this first edit_hashline_range call. After the hashline edit is rejected, recover by using read_tagged and edit_tagged against the current file. The final file should contain no non-empty lines.`,
  },
];

function commandFor(promptFile) {
  return {
    cmd: "pi",
    args: ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "-p", `@${path.basename(promptFile)}`, "-e", EXT, "--tools", "edit_hashline_range,read_tagged,edit_tagged"],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node bench/fallback-agent-runner.mjs [--out DIR] [--task ID] [--timeout SEC]");
    return;
  }
  const selected = args.task ? tasks.filter((t) => t.id === args.task) : tasks;
  await fsp.mkdir(args.out, { recursive: true });
  const results = [];
  for (const task of selected) {
    const dir = path.join(args.out, task.id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "fixture.txt"), task.fileText);
    const promptFile = path.join(dir, "prompt.md");
    await fsp.writeFile(promptFile, task.prompt);
    const metricsPath = path.join(dir, "metrics.jsonl");
    const { cmd, args: cmdArgs } = commandFor(promptFile);
    const started = Date.now();
    const res = spawnSync(cmd, cmdArgs, { cwd: dir, timeout: args.timeout * 1000, encoding: "utf8", env: { ...process.env, PI_TAGGED_EDIT_METRICS: metricsPath } });
    const durationMs = Date.now() - started;
    const finalText = fs.readFileSync(path.join(dir, "fixture.txt"), "utf8");
    const metricRecords = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, "utf8").split(/\n+/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) : [];
    const usedTaggedFallback = metricRecords.some((m) => m.tool === "edit_tagged");
    const attemptedHashline = metricRecords.some((m) => m.tool === "edit_hashline_range");
    const finalMatches = task.id === "plain-destructive-then-tagged" ? finalText.trim() === "" : finalText === task.expected;
    const record = {
      task: task.id,
      status: res.status,
      signal: res.signal,
      duration_ms: durationMs,
      success: res.status === 0 && finalMatches,
      finalMatches,
      attemptedHashline,
      usedTaggedFallback,
      fallbackAfterRejection: attemptedHashline && usedTaggedFallback,
      stdout_tail: (res.stdout || "").split("\n").slice(-30).join("\n"),
      stderr_tail: (res.stderr || "").split("\n").slice(-30).join("\n"),
      dir,
      toolMetrics: metricRecords,
    };
    results.push(record);
    await fsp.writeFile(path.join(dir, "result.json"), JSON.stringify(record, null, 2));
    console.log(JSON.stringify(record));
  }
  const summary = { total: results.length, success: results.filter((r) => r.success).length, finalMatches: results.filter((r) => r.finalMatches).length, usedTaggedFallback: results.filter((r) => r.usedTaggedFallback).length, attemptedHashline: results.filter((r) => r.attemptedHashline).length, fallbackAfterRejection: results.filter((r) => r.fallbackAfterRejection).length };
  await fsp.writeFile(path.join(args.out, "actual-results.json"), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ out: args.out, summary }, null, 2));

}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
