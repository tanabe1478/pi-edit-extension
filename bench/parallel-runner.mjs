#!/usr/bin/env node
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPlan } from "./plan.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DEFAULT_OUT = path.join(ROOT, ".bench-runs", new Date().toISOString().replace(/[:.]/g, "-"));
const DEFAULT_OMP_DIR = path.join(os.tmpdir(), "oh-my-pi-bench");

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, ohMyPiDir: process.env.OH_MY_PI_DIR || DEFAULT_OMP_DIR, clone: true, install: false, buildNative: false, smoke: false, promptsOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--oh-my-pi-dir") args.ohMyPiDir = argv[++i];
    else if (a === "--no-clone") args.clone = false;
    else if (a === "--install") args.install = true;
    else if (a === "--build-native") args.buildNative = true;
    else if (a === "--smoke") args.smoke = true;
    else if (a === "--prompts-only") args.promptsOnly = true;
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8", ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed with ${res.status}`);
}

function output(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  return { ok: res.status === 0, stdout: res.stdout, stderr: res.stderr, status: res.status };
}

function step(cmd, args, opts = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  return {
    cmd: [cmd, ...args].join(" "),
    ok: res.status === 0,
    status: res.status,
    duration_ms: Date.now() - started,
    stdout_tail: (res.stdout || "").split("\n").slice(-20).join("\n"),
    stderr_tail: (res.stderr || "").split("\n").slice(-20).join("\n"),
  };
}

async function ensureOhMyPi(dir, { clone, install, buildNative, smoke }) {
  if (!fs.existsSync(dir)) {
    if (!clone) return { present: false, reason: "missing and --no-clone set" };
    await fsp.mkdir(path.dirname(dir), { recursive: true });
    run("git", ["clone", "https://github.com/can1357/oh-my-pi", dir]);
  }
  const head = output("git", ["rev-parse", "HEAD"], { cwd: dir });
  const pkg = path.join(dir, "package.json");
  const cli = path.join(dir, "packages/coding-agent/src/cli.ts");
  const editDoc = path.join(dir, "docs/tools/edit.md");
  const hashImpl = path.join(dir, "packages/coding-agent/src/hashline/hash.ts");
  const present = fs.existsSync(pkg) && fs.existsSync(cli) && fs.existsSync(editDoc) && fs.existsSync(hashImpl);
  const setup = [];
  if (install && present) setup.push(step("bun", ["install"], { cwd: dir, timeout: 180_000 }));
  if (buildNative && present) setup.push(step("bun", ["--cwd=packages/natives", "run", "build"], { cwd: dir, timeout: 300_000 }));
  if (smoke && present) setup.push(step("bun", ["packages/coding-agent/src/cli.ts", "--version"], { cwd: dir, timeout: 60_000 }));
  const ready = present && (!smoke || setup.at(-1)?.ok === true);
  return { present, ready, dir, head: head.ok ? head.stdout.trim() : null, cli, editDoc, hashImpl, setup };
}

function modePrompt(mode, scenario) {
  const common = `You are editing fixture.ts. Complete exactly this task and do not make unrelated changes.\nScenario: ${scenario.name}\nTarget lines in the original fixture: ${scenario.start}-${scenario.end}.\n`;
  if (mode === "old_new") return common + `Use only the standard oldText/newText edit style. Replacement text:\n${scenario.payloads.old_new.edits[0].newText}\n`;
  if (mode === "tagged") return common + `Use read_tagged/edit_tagged only. edit_tagged payload:\n${JSON.stringify(scenario.payloads.tagged, null, 2)}\n`;
  if (mode === "hashline") return common + `Use read_hashline/edit_hashline_patch only. Patch:\n${scenario.payloads.hashline.input}\n`;
  if (mode === "crc") return common + `Use read_tagged to get fileCrc32, then edit_crc_range. Payload shape:\n${JSON.stringify(scenario.payloads.crc, null, 2)}\n`;
  if (mode === "oh_my_pi") return common + `Use oh-my-pi's default hashline edit mode. Equivalent hashline patch intent:\n${scenario.payloads.hashline.input}\n`;
  throw new Error(mode);
}

async function writeFixtureTasks(outDir, plan) {
  await fsp.mkdir(path.join(outDir, "tasks"), { recursive: true });
  const modes = ["old_new", "tagged", "hashline", "crc", "oh_my_pi"];
  for (const scenario of plan.scenarios) {
    const slug = scenario.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const dir = path.join(outDir, "tasks", slug);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, "fixture.ts"), plan.fixture.text);
    await fsp.writeFile(path.join(dir, "scenario.json"), JSON.stringify(scenario, null, 2));
    for (const mode of modes) await fsp.writeFile(path.join(dir, `${mode}.prompt.md`), modePrompt(mode, scenario));
  }
}

function summarizePlan(plan) {
  const totals = {};
  for (const scenario of plan.scenarios) {
    for (const [mode, metric] of Object.entries(scenario.metrics)) {
      totals[mode] ??= { chars: 0, tokens_est: 0 };
      totals[mode].chars += metric.chars;
      totals[mode].tokens_est += metric.tokens_est;
    }
  }
  return totals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node bench/parallel-runner.mjs [--out DIR] [--oh-my-pi-dir DIR] [--install] [--build-native] [--smoke] [--no-clone] [--prompts-only]\n\nCreates a neutral task plan and prompt corpus for this extension and oh-my-pi.\n\n--install       run bun install in oh-my-pi\n--build-native  run bun --cwd=packages/natives run build in oh-my-pi\n--smoke         run bun packages/coding-agent/src/cli.ts --version and record readiness\n`);
    return;
  }
  const plan = buildPlan();
  await fsp.mkdir(args.out, { recursive: true });
  await fsp.writeFile(path.join(args.out, "plan.json"), JSON.stringify(plan, null, 2));
  await fsp.writeFile(path.join(args.out, "summary.json"), JSON.stringify({ totals: summarizePlan(plan) }, null, 2));
  await writeFixtureTasks(args.out, plan);

  const omp = await ensureOhMyPi(args.ohMyPiDir, args);
  await fsp.writeFile(path.join(args.out, "oh-my-pi.json"), JSON.stringify(omp, null, 2));

  const thisCmd = `PI_TAGGED_EDIT_METRICS=${path.join(args.out, "this-extension.metrics.jsonl")} pi -e ${path.join(ROOT, "src/index.ts")}`;
  const ompCmd = omp.present ? `cd ${omp.dir} && bun packages/coding-agent/src/cli.ts` : null;
  const setupHints = !omp.present
    ? `oh-my-pi not available: ${omp.reason ?? "unknown"}`
    : omp.ready
      ? "oh-my-pi smoke check passed."
      : `oh-my-pi is present but not smoke-ready. Try:\n\n\`\`\`bash\nnpm run bench:parallel -- --out ${args.out} --oh-my-pi-dir ${omp.dir} --install --build-native --smoke\n\`\`\``;
  await fsp.writeFile(path.join(args.out, "RUNBOOK.md"), `# Parallel benchmark runbook\n\nGenerated: ${new Date().toISOString()}\n\n## This extension\n\n\`\`\`bash\n${thisCmd}\n\`\`\`\n\nUse prompts in \`tasks/*/{old_new,tagged,hashline,crc}.prompt.md\`.\n\n## oh-my-pi\n\n${setupHints}\n\n${omp.present ? `\`\`\`bash\n${ompCmd}\n\`\`\`` : ""}\n\nUse prompts in \`tasks/*/oh_my_pi.prompt.md\`.\n\n## Outputs to collect\n\n- final fixture.ts for each task/mode\n- session token/cost stats from each harness\n- this extension metrics JSONL\n- retry count and mismatch/recovery count\n`);

  console.log(JSON.stringify({ out: args.out, ohMyPi: omp, totals: summarizePlan(plan) }, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
