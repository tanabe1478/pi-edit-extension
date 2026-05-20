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
    out: path.join(ROOT, ".actual-runs", new Date().toISOString().replace(/[:.]/g, "-")),
    ohMyPiDir: process.env.OH_MY_PI_DIR || "/tmp/oh-my-pi-bench",
    modes: ["pi_edit", "tagged", "hashline_legacy", "hashline", "crc"],
    includeOhMyPi: false,
    timeout: 180,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--oh-my-pi-dir") args.ohMyPiDir = argv[++i];
    else if (a === "--modes") args.modes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--include-oh-my-pi") args.includeOhMyPi = true;
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--help") args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (args.includeOhMyPi && !args.modes.includes("oh_my_pi")) args.modes.push("oh_my_pi");
  return args;
}

function slug(s) { return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }

function promptFor(mode, scenario) {
  const common = `You are editing fixture.ts. Complete exactly this task and do not make unrelated changes.\nScenario: ${scenario.name}\nTarget lines in the original fixture: ${scenario.start}-${scenario.end}.\n`;
  if (mode === "pi_edit") return common + `Use pi's built-in edit tool only. Do not use extension tools. Built-in pi edit payload:\n${JSON.stringify(scenario.payloads.pi_edit, null, 2)}\n`;
  if (mode === "tagged") return common + `Use read_tagged/edit_tagged only. edit_tagged payload:\n${JSON.stringify(scenario.payloads.tagged, null, 2)}\n`;
  if (mode === "hashline_legacy") return common + `Use read_hashline_legacy/edit_hashline_patch_legacy only. This is the original compact hashline mode. Patch:\n${scenario.payloads.hashline_legacy.input}\n`;
  if (mode === "hashline") return common + `Use read_hashline/edit_hashline_patch only. This is adaptive strict hashline mode. Patch:\n${scenario.payloads.hashline.input}\n`;
  if (mode === "crc") return common + `Use read_tagged to get fileCrc32, then edit_crc_range. Payload shape:\n${JSON.stringify(scenario.payloads.crc, null, 2)}\n`;
  if (mode === "oh_my_pi") return common + `Use oh-my-pi's default hashline edit mode. Equivalent hashline patch intent:\n${scenario.payloads.hashline.input}\n`;
  throw new Error(`Unsupported mode ${mode}`);
}

function commandFor(mode, promptFile, args) {
  const basePi = ["--no-session", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "-p", `@${path.basename(promptFile)}`];
  if (mode === "pi_edit") return { cmd: "pi", args: [...basePi, "--tools", "read,edit"] };
  if (mode === "tagged") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_tagged"] };
  if (mode === "hashline_legacy") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline_legacy,edit_hashline_patch_legacy"] };
  if (mode === "hashline") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_hashline,edit_hashline_patch"] };
  if (mode === "crc") return { cmd: "pi", args: [...basePi, "-e", EXT, "--tools", "read_tagged,edit_crc_range"] };
  if (mode === "oh_my_pi") {
    return {
      cmd: "bun",
      args: [path.join(args.ohMyPiDir, "packages/coding-agent/src/cli.ts"), "--no-session", "--no-extensions", "--no-skills", "--no-rules", "--no-lsp", "-p", `@${path.basename(promptFile)}`],
    };
  }
  throw new Error(mode);
}

function expectedText(fixture, scenario) {
  const lines = fixture.replace(/\r\n/g, "\n").split("\n");
  const finalEmpty = lines.at(-1) === "";
  if (finalEmpty) lines.pop();
  const repl = scenario.payloads.pi_edit.edits[0].newText;
  const replacement = repl.length ? repl.replace(/\r\n/g, "\n").split("\n") : [];
  lines.splice(scenario.start - 1, scenario.end - scenario.start + 1, ...replacement);
  return lines.join("\n") + (finalEmpty ? "\n" : "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node bench/actual-runner.mjs [--out DIR] [--modes pi_edit,tagged,hashline_legacy,hashline,crc] [--include-oh-my-pi] [--timeout SEC]");
    return;
  }
  const plan = buildPlan();
  await fsp.mkdir(args.out, { recursive: true });
  await fsp.writeFile(path.join(args.out, "plan.json"), JSON.stringify(plan, null, 2));
  const results = [];

  for (const scenario of plan.scenarios) {
    for (const mode of args.modes) {
      const dir = path.join(args.out, "runs", mode, slug(scenario.name));
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, "fixture.ts"), plan.fixture.text);
      const promptFile = path.join(dir, "prompt.md");
      await fsp.writeFile(promptFile, promptFor(mode, scenario));
      const metricsPath = path.join(dir, "metrics.jsonl");
      const { cmd, args: cmdArgs } = commandFor(mode, promptFile, args);
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
  const totals = {};
  for (const scenario of plan.scenarios) {
    for (const [mode, metric] of Object.entries(scenario.metrics || {})) {
      totals[mode] ??= { chars: 0, tokens_est: 0 };
      totals[mode].chars += metric.chars || 0;
      totals[mode].tokens_est += metric.tokens_est || 0;
    }
  }
  await fsp.writeFile(path.join(args.out, "summary.json"), JSON.stringify({ totals }, null, 2));
  const allMetrics = results.flatMap((r) => (r.toolMetrics || []).map((m) => ({ ...m, mode: r.mode, scenario: r.scenario })));
  if (allMetrics.length) await fsp.writeFile(path.join(args.out, "this-extension.metrics.jsonl"), allMetrics.map((m) => JSON.stringify(m)).join("\n") + "\n");
  await fsp.writeFile(path.join(args.out, "actual-results.json"), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ out: args.out, summary }, null, 2));
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
