#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EXT = path.join(ROOT, "src/index.ts");

function makeRoutesFile() {
  const routes = [];
  for (let i = 1; i <= 40; i++) {
    routes.push(`  { method: "GET", path: "/route-${i}", handler: "handleRoute${i}" },`);
  }
  return `export const routes = [\n${routes.join("\n")}\n];\n`;
}

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
  "src/legacy.js": `export function legacyNormalize(value) {
  return String(value ?? "").trim();
}
`,
  "src/routes.js": makeRoutesFile(),
  "config/app.json": `${JSON.stringify({ name: "demo-client", cache: { enabled: false, ttlSeconds: 60 } }, null, 2)}\n`,
  "README.md": `# Demo Client

A small JavaScript client used for edit-tool product evaluation.

## Configuration

The client supports timeout and retry options.

## Development

Run tests with npm test.
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
  "test/routes.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { routes } from "../src/routes.js";

test("route 37 uses GET handler", () => {
  assert.deepEqual(routes[36], { method: "GET", path: "/route-37", handler: "handleRoute37" });
});
`,
  "test/app-config.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appConfig = JSON.parse(readFileSync(new URL("../config/app.json", import.meta.url), "utf8"));

test("app config disables cache by default", () => {
  assert.equal(appConfig.cache.enabled, false);
  assert.equal(appConfig.cache.ttlSeconds, 60);
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
  {
    id: "validate-timeout-positive",
    name: "Validate positive timeout",
    prompt: "Add validation so parseConfig throws a RangeError with message \"timeoutMs must be positive\" when timeoutMs is less than or equal to 0. Keep defaults and valid overrides working. Update tests. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/config.js": `export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_RETRIES = 2;

export function parseConfig(input = {}) {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be positive");
  }
  return {
    timeoutMs,
    retries: input.retries ?? DEFAULT_RETRIES,
  };
}
`,
      "test/config.test.js": baseFiles["test/config.test.js"].replace(`test("parseConfig accepts overrides", () => {
  assert.deepEqual(parseConfig({ timeoutMs: 100, retries: 4 }), { timeoutMs: 100, retries: 4 });
});
`, `test("parseConfig accepts overrides", () => {
  assert.deepEqual(parseConfig({ timeoutMs: 100, retries: 4 }), { timeoutMs: 100, retries: 4 });
});

test("parseConfig rejects non-positive timeouts", () => {
  assert.throws(() => parseConfig({ timeoutMs: 0 }), /timeoutMs must be positive/);
  assert.throws(() => parseConfig({ timeoutMs: -1 }), /timeoutMs must be positive/);
});
`),
    }),
  },
  {
    id: "add-base-url-config",
    name: "Add base URL config",
    prompt: "Add a DEFAULT_BASE_URL of \"https://api.example.com\" to config parsing. parseConfig should return baseUrl, createClient should expose baseUrl, and request(path) should include url built by concatenating baseUrl and path. Keep timeout/retry behavior. Update tests. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/config.js": `export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_BASE_URL = "https://api.example.com";

export function parseConfig(input = {}) {
  return {
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: input.retries ?? DEFAULT_RETRIES,
    baseUrl: input.baseUrl ?? DEFAULT_BASE_URL,
  };
}
`,
      "src/client.js": `import { parseConfig } from "./config.js";

export function createClient(options = {}) {
  const config = parseConfig(options);
  return {
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    baseUrl: config.baseUrl,
    request(path) {
      return { path, url: config.baseUrl + path, timeoutMs: config.timeoutMs, retries: config.retries };
    },
  };
}
`,
      "test/config.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, DEFAULT_TIMEOUT_MS, DEFAULT_RETRIES, DEFAULT_BASE_URL } from "../src/config.js";
import { createClient } from "../src/client.js";

test("parseConfig uses defaults", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 5000);
  assert.equal(DEFAULT_BASE_URL, "https://api.example.com");
  assert.deepEqual(parseConfig(), { timeoutMs: 5000, retries: 2, baseUrl: "https://api.example.com" });
});

test("parseConfig accepts overrides", () => {
  assert.deepEqual(parseConfig({ timeoutMs: 100, retries: 4, baseUrl: "https://internal.example" }), { timeoutMs: 100, retries: 4, baseUrl: "https://internal.example" });
});

test("client uses parsed config", () => {
  const client = createClient();
  assert.equal(client.baseUrl, DEFAULT_BASE_URL);
  assert.deepEqual(client.request("/health"), { path: "/health", url: "https://api.example.com/health", timeoutMs: 5000, retries: DEFAULT_RETRIES });
});
`,
    }),
  },
  {
    id: "enable-json-cache",
    name: "Enable JSON cache",
    prompt: "Enable cache in config/app.json by changing cache.enabled from false to true. Keep the cache ttlSeconds value unchanged. Update the corresponding app config test. Run the test command if possible.",
    expectedFiles: withFiles({
      "config/app.json": `${JSON.stringify({ name: "demo-client", cache: { enabled: true, ttlSeconds: 60 } }, null, 2)}\n`,
      "test/app-config.test.js": baseFiles["test/app-config.test.js"].replace("disables cache by default", "enables cache").replace("appConfig.cache.enabled, false", "appConfig.cache.enabled, true"),
    }),
  },
  {
    id: "document-base-url-option",
    name: "Document base URL option",
    prompt: "Update README.md to document that createClient accepts a baseUrl option. Mention that it defaults to https://api.example.com and that request paths are appended to it. Do not change code. Run the test command if possible.",
    expectedFiles: withFiles({
      "README.md": `# Demo Client

A small JavaScript client used for edit-tool product evaluation.

## Configuration

The client supports timeout, retry, and baseUrl options.
The baseUrl option defaults to https://api.example.com, and request paths are appended to it.

## Development

Run tests with npm test.
`,
    }),
  },
  {
    id: "update-large-route-entry",
    name: "Update large route entry",
    prompt: "In src/routes.js, update only the /route-37 entry so it uses method \"POST\" and handler \"submitRoute37\". Update the corresponding route test. Do not change other routes. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/routes.js": baseFiles["src/routes.js"].replace('{ method: "GET", path: "/route-37", handler: "handleRoute37" }', '{ method: "POST", path: "/route-37", handler: "submitRoute37" }'),
      "test/routes.test.js": baseFiles["test/routes.test.js"].replace("route 37 uses GET handler", "route 37 uses POST submit handler").replace('{ method: "GET", path: "/route-37", handler: "handleRoute37" }', '{ method: "POST", path: "/route-37", handler: "submitRoute37" }'),
    }),
  },
  {
    id: "create-logger-module",
    name: "Create logger module",
    lifecycle: true,
    prompt: "Create a new src/logger.js module exporting formatLogLevel(level = \"info\") that returns the uppercased string form of the level. Add test/logger.test.js covering the default and a \"debug\" override. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/logger.js": `export function formatLogLevel(level = "info") {
  return String(level).toUpperCase();
}
`,
      "test/logger.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { formatLogLevel } from "../src/logger.js";

test("formatLogLevel uses INFO by default", () => {
  assert.equal(formatLogLevel(), "INFO");
});

test("formatLogLevel uppercases overrides", () => {
  assert.equal(formatLogLevel("debug"), "DEBUG");
});
`,
    }),
  },
  {
    id: "delete-legacy-module",
    name: "Delete legacy module",
    lifecycle: true,
    prompt: "Delete the unused src/legacy.js module. Do not change runtime behavior. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/legacy.js": null,
    }),
  },
  {
    id: "rename-config-to-settings",
    name: "Rename config module to settings",
    lifecycle: true,
    prompt: "Rename src/config.js to src/settings.js and update imports in source and tests. Do not change behavior. Run the test command if possible.",
    expectedFiles: withFiles({
      "src/config.js": null,
      "src/settings.js": baseFiles["src/config.js"],
      "src/client.js": baseFiles["src/client.js"].replace('./config.js', './settings.js'),
      "test/config.test.js": baseFiles["test/config.test.js"].replace('../src/config.js', '../src/settings.js'),
    }),
  },
];

function parseArgs(argv) {
  const args = { out: path.join(ROOT, ".product-runs", new Date().toISOString().replace(/[:.]/g, "-")), modes: ["pi_edit", "tagged", "hashline_range", "hybrid_hashline_tagged", "codex_patch"], timeout: 240, task: null, limit: null, trials: 1, captureSession: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--modes") args.modes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--task") args.task = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--trials") args.trials = Number(argv[++i]);
    else if (a === "--capture-session") args.captureSession = true;
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
  const lifecycle = task.lifecycle ? "This task may require file creation, deletion, or rename. You may use bash for file lifecycle operations, and use the mode-specific edit tools for editing existing file contents.\n" : "";
  const common = `You are editing a small JavaScript product repository in this directory.\nTask: ${task.prompt}\nDo not make unrelated changes. Inspect files as needed and construct edit payloads yourself.\n${lifecycle}`;
  if (mode === "pi_edit") return common + "Use built-in read/edit/write tools for file changes. Bash is available for tests and lifecycle operations.\n";
  if (mode === "tagged") return common + "Use read_tagged and edit_tagged for existing-file content modifications. Bash is available for tests and lifecycle operations.\n";
  if (mode === "hashline_range") return common + "Use read_hashline and edit_hashline_range for existing-file content modifications. Copy anchors exactly, including :tag when present. Bash is available for tests and lifecycle operations.\n";
  if (mode === "hybrid_hashline_tagged") return common + "For existing-file content modifications, prefer read_hashline + edit_hashline_range for line-oriented edits. If hashline anchors are inconvenient or an edit is rejected, fall back to read_tagged + edit_tagged. Bash is available for tests and lifecycle operations. Do not use built-in edit for existing-file content edits.\n";
  if (mode === "codex_patch") return common + "Use only read and edit_codex_patch for file modifications.\n";
  if (mode === "replace_edit_tagged") return common + "This mode evaluates replacing only the built-in edit tool. Built-in read/write/bash are available. Do not use built-in edit. Use read_tagged + edit_tagged for existing-file content edits; use write/bash for file lifecycle operations.\n";
  if (mode === "replace_edit_hashline") return common + "This mode evaluates replacing only the built-in edit tool. Built-in read/write/bash are available. Do not use built-in edit. Use read_hashline + edit_hashline_range for existing-file content edits; use write/bash for file lifecycle operations. Copy anchors exactly, including :tag when present.\n";
  if (mode === "replace_edit_hybrid") return common + "This mode evaluates replacing only the built-in edit tool. Built-in read/write/bash are available. Do not use built-in edit. For existing-file content edits, prefer read_hashline + edit_hashline_range. If anchors are inconvenient or an edit is rejected, fall back to read_tagged + edit_tagged. Use write/bash for file lifecycle operations.\n";
  if (mode === "replace_edit_policy") return common + "This mode evaluates the recommended edit replacement policy. Built-in read/write/bash are available. Do not use built-in edit. For normal existing-file content edits, use read_tagged + edit_tagged. Use read_hashline + edit_hashline_range when stale safety is important, the file is large/repeated, or exact anchors matter. If a hashline edit is rejected, recover with read_tagged + edit_tagged. Use write/bash for file lifecycle operations and tests.\n";
  throw new Error(mode);
}

function commandFor(mode, promptFile, sessionDir = null) {
  const basePi = [sessionDir ? "--session-dir" : "--no-session", ...(sessionDir ? [sessionDir] : []), "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "-p", `@${path.basename(promptFile)}`];
  if (mode === "pi_edit") return { cmd: "pi", args: [...basePi, "--tools", "read,edit,write,bash"] };
  if (mode === "tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_tagged,bash"] };
  if (mode === "hashline_range") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_range,bash"] };
  if (mode === "hybrid_hashline_tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_range,read_tagged,edit_tagged,bash"] };
  if (mode === "codex_patch") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,edit_codex_patch,bash"] };
  if (mode === "replace_edit_tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,write,bash,read_tagged,edit_tagged"] };
  if (mode === "replace_edit_hashline") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,write,bash,read_hashline,edit_hashline_range"] };
  if (mode === "replace_edit_hybrid") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,write,bash,read_hashline,edit_hashline_range,read_tagged,edit_tagged"] };
  if (mode === "replace_edit_policy") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range"] };
  throw new Error(mode);
}

function compareFiles(dir, expectedFiles) {
  const diffs = [];
  for (const [rel, expected] of Object.entries(expectedFiles)) {
    const file = path.join(dir, rel);
    const exists = fs.existsSync(file);
    if (expected === null) {
      if (exists) diffs.push({ file: rel, expected: "absent", actualChars: fs.readFileSync(file, "utf8").length });
      continue;
    }
    const actual = exists ? fs.readFileSync(file, "utf8") : null;
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

function summarizeSessionToolIo(sessionDir) {
  const out = { toolCalls: 0, readCalls: 0, editCalls: 0, toolInputChars: 0, toolResultChars: 0, totalToolIoChars: 0, byTool: {} };
  if (!sessionDir || !fs.existsSync(sessionDir)) return out;
  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(sessionDir, f));
  if (files.length === 0) return out;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const lines = fs.readFileSync(files[0], "utf8").split(/\n+/).filter(Boolean);
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const msg = rec.message;
    if (!msg) continue;
    if (msg.role === "assistant") {
      for (const c of msg.content || []) {
        if (c.type !== "toolCall") continue;
        const tool = c.name || "unknown";
        const inputChars = JSON.stringify(c.arguments || {}).length;
        out.toolCalls++;
        if (tool.startsWith("read") || tool === "search_hashline") out.readCalls++;
        if (tool.startsWith("edit")) out.editCalls++;
        out.toolInputChars += inputChars;
        out.byTool[tool] ??= { calls: 0, inputChars: 0, resultChars: 0 };
        out.byTool[tool].calls++;
        out.byTool[tool].inputChars += inputChars;
      }
    }
    if (msg.role === "toolResult") {
      const tool = msg.toolName || "unknown";
      const resultChars = (msg.content || []).map((c) => c.text || "").join("\n").length;
      out.toolResultChars += resultChars;
      out.byTool[tool] ??= { calls: 0, inputChars: 0, resultChars: 0 };
      out.byTool[tool].resultChars += resultChars;
    }
  }
  out.totalToolIoChars = out.toolInputChars + out.toolResultChars;
  return out;
}

function classifyOutcome({ res, timedOut, exact, checksPass, productSuccess, diffs, metricRecords }) {
  if (productSuccess && exact) return "success_exact";
  if (productSuccess && !exact) return "success_product_only";
  if (timedOut) return "timeout";
  const stderr = res.stderr || "";
  const stdout = res.stdout || "";
  const combined = `${stdout}\n${stderr}`;
  const hadRejection = metricRecords.some((m) => m.rejectedForBenchmark || m.error || m.mismatch);
  if (hadRejection && !productSuccess) return "tool_rejection_unrecovered";
  if (res.status !== 0) {
    if (/Tool .* failed|Error executing tool|Invalid tool|schema|parameters/i.test(combined)) return "syntax_or_tool_misuse";
    return "pi_failed";
  }
  if (!checksPass) return "tests_failed";
  if (diffs.some((d) => d.expected === "absent")) return "unexpected_file_present";
  if (diffs.some((d) => d.actualChars === null)) return "missing_file";
  if (!exact) return "exact_mismatch_only";
  return "unknown";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node bench/product-runner.mjs [--out DIR] [--modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch] [--task ID] [--limit N] [--trials N] [--timeout SEC] [--capture-session]");
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
      for (let trial = 1; trial <= args.trials; trial++) {
        const trialPart = args.trials > 1 ? `trial-${trial}` : "";
        const dir = path.join(args.out, "runs", mode, task.id, trialPart);
        await fsp.mkdir(dir, { recursive: true });
        await writeFiles(dir, baseFiles);
        const promptFile = path.join(dir, "prompt.md");
        await fsp.writeFile(promptFile, promptFor(mode, task));
        const metricsPath = path.join(dir, "metrics.jsonl");
        const sessionDir = args.captureSession ? path.join(dir, ".pi-sessions") : null;
        if (sessionDir) await fsp.mkdir(sessionDir, { recursive: true });
        const { cmd, args: cmdArgs } = commandFor(mode, promptFile, sessionDir);
        const started = Date.now();
        const res = spawnSync(cmd, cmdArgs, { cwd: dir, timeout: args.timeout * 1000, encoding: "utf8", env: { ...process.env, PI_TAGGED_EDIT_METRICS: metricsPath } });
        const durationMs = Date.now() - started;
        const timedOut = res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM";
        const check = spawnSync("npm", ["test"], { cwd: dir, timeout: 60_000, encoding: "utf8" });
        const diffs = compareFiles(dir, task.expectedFiles);
        const metricRecords = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, "utf8").split(/\n+/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean) : [];
        const exact = diffs.length === 0;
        const checksPass = check.status === 0;
        const productSuccess = res.status === 0 && checksPass;
        const toolIo = summarizeToolIo(metricRecords);
        const sessionToolIo = summarizeSessionToolIo(sessionDir);
        const outcomeCategory = classifyOutcome({ res, timedOut, exact, checksPass, productSuccess, diffs, metricRecords });
        const record = { mode, task: task.id, trial, status: res.status, signal: res.signal, timed_out: timedOut, duration_ms: durationMs, exact, checks_pass: checksPass, product_success: productSuccess, success: productSuccess, outcomeCategory, diffs, toolIo, sessionToolIo, stdout_tail: (res.stdout || "").split("\n").slice(-20).join("\n"), stderr_tail: (res.stderr || "").split("\n").slice(-20).join("\n"), check_tail: ((check.stdout || "") + (check.stderr || "")).split("\n").slice(-20).join("\n"), dir, toolMetrics: metricRecords };
        results.push(record);
        await fsp.writeFile(path.join(dir, "result.json"), JSON.stringify(record, null, 2));
        console.log(JSON.stringify(record));
      }
    }
  }
  const summary = {};
  for (const r of results) {
    summary[r.mode] ??= { total: 0, success: 0, product_success: 0, exact: 0, checks_pass: 0, duration_ms: 0, toolCalls: 0, readCalls: 0, editCalls: 0, readResultChars: 0, editInputChars: 0, totalToolIoChars: 0, sessionToolCalls: 0, sessionToolInputChars: 0, sessionToolResultChars: 0, sessionTotalToolIoChars: 0, outcomeCategories: {} };
    summary[r.mode].total++;
    if (r.success) summary[r.mode].success++;
    if (r.product_success) summary[r.mode].product_success++;
    if (r.exact) summary[r.mode].exact++;
    if (r.checks_pass) summary[r.mode].checks_pass++;
    summary[r.mode].duration_ms += r.duration_ms;
    for (const key of ["toolCalls", "readCalls", "editCalls", "readResultChars", "editInputChars", "totalToolIoChars"]) summary[r.mode][key] += r.toolIo?.[key] || 0;
    summary[r.mode].outcomeCategories[r.outcomeCategory] = (summary[r.mode].outcomeCategories[r.outcomeCategory] || 0) + 1;
    summary[r.mode].sessionToolCalls += r.sessionToolIo?.toolCalls || 0;
    summary[r.mode].sessionToolInputChars += r.sessionToolIo?.toolInputChars || 0;
    summary[r.mode].sessionToolResultChars += r.sessionToolIo?.toolResultChars || 0;
    summary[r.mode].sessionTotalToolIoChars += r.sessionToolIo?.totalToolIoChars || 0;
  }
  for (const s of Object.values(summary)) {
    s.avg_duration_ms = Math.round(s.duration_ms / s.total);
    s.avgToolIoChars = Math.round(s.totalToolIoChars / s.total);
    s.avgToolCalls = Number((s.toolCalls / s.total).toFixed(1));
    s.avgSessionToolIoChars = Math.round(s.sessionTotalToolIoChars / s.total);
    s.avgSessionToolCalls = Number((s.sessionToolCalls / s.total).toFixed(1));
  }
  await fsp.writeFile(path.join(args.out, "actual-results.json"), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ out: args.out, summary }, null, 2));
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
