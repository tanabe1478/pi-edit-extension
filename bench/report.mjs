#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
  } catch { return []; }
}

function parseArgs(argv) {
  const args = { dir: argv[0] || process.cwd(), out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function pct(base, value) {
  if (!base) return 0;
  return Number((((base - value) / base) * 100).toFixed(1));
}

function summarizeMetrics(records) {
  const byTool = {};
  for (const r of records) {
    const key = r.tool || "unknown";
    byTool[key] ??= { calls: 0, resultChars: 0, inputChars: 0, savedCharsEstimate: 0, recovered: 0 };
    byTool[key].calls++;
    byTool[key].resultChars += r.resultChars || 0;
    byTool[key].inputChars += r.inputChars || r.taggedInputChars || 0;
    byTool[key].savedCharsEstimate += r.savedCharsEstimate || 0;
    if (r.recovered) byTool[key].recovered++;
  }
  return byTool;
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? "").length)));
  const fmt = (r) => `| ${r.map((c, i) => String(c ?? "").padEnd(widths[i])).join(" | ")} |`;
  return [fmt(headers), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)].join("\n");
}

function buildReport(dir) {
  const summary = readJson(path.join(dir, "summary.json"), {});
  const plan = readJson(path.join(dir, "plan.json"), {});
  const omp = readJson(path.join(dir, "oh-my-pi.json"), {});
  const metrics = readJsonl(path.join(dir, "this-extension.metrics.jsonl"));
  const actual = readJson(path.join(dir, "actual-results.json"), null);
  const totals = summary.totals || (() => {
    const out = {};
    for (const s of plan.scenarios || []) {
      for (const [mode, metric] of Object.entries(s.metrics || {})) {
        out[mode] ??= { chars: 0, tokens_est: 0 };
        out[mode].chars += metric.chars || 0;
        out[mode].tokens_est += metric.tokens_est || 0;
      }
    }
    return out;
  })();
  const base = totals.old_new?.chars || 0;

  const rows = Object.entries(totals).map(([mode, m]) => [
    mode,
    m.chars,
    m.tokens_est,
    mode === "old_new" ? "baseline" : `${pct(base, m.chars)}%`,
  ]);

  const metricSummary = summarizeMetrics(metrics);
  const metricRows = Object.entries(metricSummary).map(([tool, m]) => [tool, m.calls, m.inputChars, m.resultChars, m.savedCharsEstimate, m.recovered]);

  const taskRows = (plan.scenarios || []).map((s) => [s.name, s.edited_lines, s.metrics?.old_new?.chars, s.metrics?.pi_edit?.chars, s.metrics?.tagged?.chars, s.metrics?.hashline?.chars, s.metrics?.crc?.chars]);

  const lines = [];
  lines.push(`# pi-edit-extension benchmark report`);
  lines.push("");
  lines.push(`Run directory: \`${dir}\``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Payload-size summary`);
  lines.push("");
  lines.push(table(["mode", "chars", "tokens_est", "saved_vs_old_new"], rows));
  lines.push("");
  lines.push(`## Scenario payload sizes`);
  lines.push("");
  lines.push(table(["scenario", "lines", "old_new", "pi_edit", "tagged", "hashline", "crc"], taskRows));
  lines.push("");
  lines.push(`## Actual harness run results`);
  lines.push("");
  if (actual?.summary) {
    lines.push(table(["mode", "success", "total", "avg_duration_ms"], Object.entries(actual.summary).map(([mode, s]) => [mode, s.success, s.total, s.avg_duration_ms])));
  } else {
    lines.push("No `actual-results.json` found yet.");
  }
  lines.push("");
  lines.push(`## this-extension runtime metrics`);
  lines.push("");
  if (metricRows.length) lines.push(table(["tool", "calls", "inputChars", "resultChars", "savedCharsEstimate", "recovered"], metricRows));
  else lines.push("No `this-extension.metrics.jsonl` found yet.");
  lines.push("");
  lines.push(`## oh-my-pi status`);
  lines.push("");
  lines.push(`- present: ${Boolean(omp.present)}`);
  lines.push(`- ready: ${Boolean(omp.ready)}`);
  if (omp.dir) lines.push(`- dir: \`${omp.dir}\``);
  if (omp.head) lines.push(`- head: \`${omp.head}\``);
  if (omp.setup?.length) {
    lines.push("");
    lines.push(table(["cmd", "ok", "status", "duration_ms"], omp.setup.map((s) => [s.cmd, s.ok, s.status, s.duration_ms])));
  }
  lines.push("");
  lines.push(`## Next collection steps`);
  lines.push("");
  lines.push(`1. Run each prompt under the specified harness/mode.`);
  lines.push(`2. Save final fixture outputs by mode for correctness checking.`);
  lines.push(`3. Re-run this report after metrics JSONL exists.`);

  return { markdown: lines.join("\n"), json: { dir, totals, scenarios: plan.scenarios || [], actual: actual?.summary || null, metricSummary, ohMyPi: omp } };
}

const args = parseArgs(process.argv.slice(2));
const report = buildReport(path.resolve(args.dir));
if (args.out) {
  fs.writeFileSync(args.out, report.markdown);
  fs.writeFileSync(args.out.replace(/\.md$/, ".json"), JSON.stringify(report.json, null, 2));
} else {
  console.log(report.markdown);
}
