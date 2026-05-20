#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EXT = path.join(ROOT, "src/index.ts");

const baseFiles = {
  "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2) + "\n",
  "src/config.js": `export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_RETRIES = 2;

export function parseConfig(input = {}) {
  return {
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: input.retries ?? DEFAULT_RETRIES,
  };
}
`,
  "src/client.js": `import { parseConfig } from "./config.js";

export function createClient(options = {}) {
  const config = parseConfig(options);
  return {
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    request(path) {
      return { path, timeoutMs: config.timeoutMs, retries: config.retries };
    },
  };
}
`,
  "test/config.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, DEFAULT_TIMEOUT_MS, DEFAULT_RETRIES } from "../src/config.js";
import { createClient } from "../src/client.js";

test("parseConfig uses defaults", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 5000);
  assert.deepEqual(parseConfig(), { timeoutMs: 5000, retries: 2 });
});

test("parseConfig accepts overrides", () => {
  assert.deepEqual(parseConfig({ timeoutMs: 100, retries: 4 }), { timeoutMs: 100, retries: 4 });
});

test("client uses parsed config", () => {
  const client = createClient();
  assert.equal(client.request("/health").timeoutMs, 5000);
  assert.equal(client.request("/health").retries, DEFAULT_RETRIES);
});
`,
};

function withFiles(overrides) { return { ...baseFiles, ...overrides }; }

const tasks = [
  {
    id: "default-timeout-8000",
    name: "Change default timeout to 8000",
    prompt: "Change the product default timeout from 5000ms to 8000ms. Update implementation and tests. Keep explicit user overrides working. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/config.js": baseFiles["src/config.js"].replace("DEFAULT_TIMEOUT_MS = 5000", "DEFAULT_TIMEOUT_MS = 8000"),
      "test/config.test.js": baseFiles["test/config.test.js"].replaceAll("5000", "8000"),
    }),
  },
  {
    id: "default-retries-3",
    name: "Change default retries to 3",
    prompt: "Change the product default retry count from 2 to 3. Update implementation and tests. Keep explicit user overrides working. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/config.js": baseFiles["src/config.js"].replace("DEFAULT_RETRIES = 2", "DEFAULT_RETRIES = 3"),
      "test/config.test.js": baseFiles["test/config.test.js"].replace("{ timeoutMs: 5000, retries: 2 }", "{ timeoutMs: 5000, retries: 3 }").replace("retries, DEFAULT_RETRIES", "retries, DEFAULT_RETRIES"),
    }),
  },
  {
    id: "rename-request-path-param",
    name: "Rename request path parameter",
    prompt: "In the client request method, rename the parameter from path to endpoint and return { endpoint, timeoutMs, retries } instead of { path, timeoutMs, retries }. Update tests accordingly. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/client.js": `import { parseConfig } from "./config.js";

export function createClient(options = {}) {
  const config = parseConfig(options);
  return {
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    request(endpoint) {
      return { endpoint, timeoutMs: config.timeoutMs, retries: config.retries };
    },
  };
}
`,
      "test/config.test.js": baseFiles["test/config.test.js"].replace('assert.equal(client.request("/health").timeoutMs, 5000);', 'assert.deepEqual(client.request("/health"), { endpoint: "/health", timeoutMs: 5000, retries: DEFAULT_RETRIES });').replace('  assert.equal(client.request("/health").retries, DEFAULT_RETRIES);\n', ""),
    }),
  },
];

function parseArgs(argv) {
  const args = { out: path.join(ROOT, ".product-runs", new Date().toISOString().replace(/[:.]/g, "-")), modes: ["pi_edit", "tagged", "hashline_range", "hybrid_hashline_tagged", "codex_patch"], timeout: 240, task: null, limit: null };
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

async function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, content, "utf8");
  }
}

function promptFor(mode, task) {
  const common = `You are editing a small JavaScript product repository in this directory.\nTask: ${task.prompt}\nDo not make unrelated changes. Inspect files as needed and construct edit payloads yourself.\n`;
  if (mode === "pi_edit") return common + "Use only built-in read and edit tools.\n";
  if (mode === "tagged") return common + "Use only read_tagged and edit_tagged for file modifications.\n";
  if (mode === "hashline_range") return common + "Use only read_hashline and edit_hashline_range for file modifications. Copy anchors exactly, including :tag when present.\n";
  if (mode === "hybrid_hashline_tagged") return common + "For file modifications, prefer read_hashline + edit_hashline_range for line-oriented edits. If hashline anchors are inconvenient or an edit is rejected, fall back to read_tagged + edit_tagged. Do not use built-in edit.\n";
  if (mode === "codex_patch") return common + "Use only read and edit_codex_patch for file modifications.\n";
  throw new Error(mode);
}

function commandFor(mode, promptFile) {
  const basePi = ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "-p", `@${path.basename(promptFile)}`];
  if (mode === "pi_edit") return { cmd: "pi", args: [...basePi, "--tools", "read,edit,bash"] };
  if (mode === "tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_tagged,bash"] };
  if (mode === "hashline_range") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_range,bash"] };
  if (mode === "hybrid_hashline_tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_range,read_tagged,edit_tagged,bash"] };
  if (mode === "codex_patch") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,edit_codex_patch,bash"] };
  throw new Error(mode);
}

function compareFiles(dir, expectedFiles) {
  const diffs = [];
  for (const [rel, expected] of Object.entries(expectedFiles)) {
    const file = path.join(dir, rel);
    const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (actual !== expected) diffs.push({ file: rel, expectedChars: expected.length, actualChars: actual?.length ?? null });
  }
  return diffs;
}

function summarizeToolIo(records) {
  const out = { toolCalls: records.length, readCalls: 0, editCalls: 0, readResultChars: 0, editInputChars: 0, totalToolIoChars: 0 };
  for (const r of records) {
    const tool = r.tool || "";
    const resultChars = r.resultChars || 0;
    const inputChars = r.inputChars || r.taggedInputChars || 0;
    if (tool.startsWith("read") || tool === "search_hashline") out.readCalls++;
    if (tool.startsWith("edit")) out.editCalls++;
    out.readResultChars += resultChars;
    out.editInputChars += inputChars;
    out.totalToolIoChars += resultChars + inputChars;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node bench/product-runner.mjs [--out DIR] [--modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch] [--task ID] [--limit N] [--timeout SEC]");
    return;
  }
  let selected = tasks;
  if (args.task) selected = selected.filter((t) => t.id === args.task || slug(t.name) === args.task);
  if (args.limit) selected = selected.slice(0, args.limit);
  await fsp.mkdir(args.out, { recursive: true });
  await fsp.writeFile(path.join(args.out, "tasks.json"), JSON.stringify(selected.map(({ expectedFiles, ...t }) => t), null, 2));
  const results = [];
  for (const task of selected) {
    for (const mode of args.modes) {
      const dir = path.join(args.out, "runs", mode, task.id);
      await fsp.mkdir(dir, { recursive: true });
      await writeFiles(dir, baseFiles);
      const promptFile = path.join(dir, "prompt.md");
      await fsp.writeFile(promptFile, promptFor(mode, task));
      const metricsPath = path.join(dir, "metrics.jsonl");
      const { cmd, args: cmdArgs } = commandFor(mode, promptFile);
      const started = Date.now();
      const res = spawnSync(cmd, cmdArgs, { cwd: dir, timeout: args.timeout * 1000, encoding: "utf8", env: { ...process.env, PI_TAGGED_EDIT_METRICS: metricsPath } });
      const durationMs = Date.now() - started;
      const check = spawnSync("npm", ["test"], { cwd: dir, timeout: 60_000, encoding: "utf8" });
      const diffs = compareFiles(dir, task.expectedFiles);
      const metricRecords = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, "utf8").split(/\n+/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) : [];
      const exact = diffs.length === 0;
      const checksPass = check.status === 0;
      const productSuccess = res.status === 0 && checksPass;
      const toolIo = summarizeToolIo(metricRecords);
      const record = { mode, task: task.id, status: res.status, signal: res.signal, duration_ms: durationMs, exact, checks_pass: checksPass, product_success: productSuccess, success: productSuccess, diffs, toolIo, stdout_tail: (res.stdout || "").split("\n").slice(-20).join("\n"), stderr_tail: (res.stderr || "").split("\n").slice(-20).join("\n"), check_tail: ((check.stdout || "") + (check.stderr || "")).split("\n").slice(-20).join("\n"), dir, toolMetrics: metricRecords };
      results.push(record);
      await fsp.writeFile(path.join(dir, "result.json"), JSON.stringify(record, null, 2));
      console.log(JSON.stringify(record));
    }
  }
  const summary = {};
  for (const r of results) {
    summary[r.mode] ??= { total: 0, success: 0, product_success: 0, exact: 0, checks_pass: 0, duration_ms: 0, toolCalls: 0, readCalls: 0, editCalls: 0, readResultChars: 0, editInputChars: 0, totalToolIoChars: 0 };
    summary[r.mode].total++;
    if (r.success) summary[r.mode].success++;
    if (r.product_success) summary[r.mode].product_success++;
    if (r.exact) summary[r.mode].exact++;
    if (r.checks_pass) summary[r.mode].checks_pass++;
    summary[r.mode].duration_ms += r.duration_ms;
    for (const key of ["toolCalls", "readCalls", "editCalls", "readResultChars", "editInputChars", "totalToolIoChars"]) summary[r.mode][key] += r.toolIo?.[key] || 0;
  }
  for (const s of Object.values(summary)) {
    s.avg_duration_ms = Math.round(s.duration_ms / s.total);
    s.avgToolIoChars = Math.round(s.totalToolIoChars / s.total);
    s.avgToolCalls = Number((s.toolCalls / s.total).toFixed(1));
  }
  await fsp.writeFile(path.join(args.out, "actual-results.json"), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ out: args.out, summary }, null, 2));
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
