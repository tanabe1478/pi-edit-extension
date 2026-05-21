#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

function parseArgs(argv) {
  const args = { out: null, inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--help") args.help = true;
    else args.inputs.push(a);
  }
  return args;
}

function usage() {
  return `Usage: node bench/product-summary.mjs [--out report.md] <run-dir-or-actual-results.json>...\n\nAggregates bench:product actual-results.json files by mode and task.`;
}

function readResult(input) {
  const file = fs.statSync(input).isDirectory() ? path.join(input, "actual-results.json") : input;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, ...json };
}

function empty() {
  return { total: 0, product_success: 0, exact: 0, checks_pass: 0, duration_ms: 0, toolCalls: 0, totalToolIoChars: 0, outcomeCategories: {} };
}

function add(into, r) {
  into.total++;
  if (r.product_success) into.product_success++;
  if (r.exact) into.exact++;
  if (r.checks_pass) into.checks_pass++;
  into.duration_ms += r.duration_ms || 0;
  into.toolCalls += r.toolIo?.toolCalls || 0;
  into.totalToolIoChars += r.toolIo?.totalToolIoChars || 0;
  const cat = r.outcomeCategory || "unknown";
  into.outcomeCategories[cat] = (into.outcomeCategories[cat] || 0) + 1;
}

function finish(s) {
  s.avg_duration_ms = s.total ? Math.round(s.duration_ms / s.total) : 0;
  s.avgToolIoChars = s.total ? Math.round(s.totalToolIoChars / s.total) : 0;
  s.avgToolCalls = s.total ? Number((s.toolCalls / s.total).toFixed(1)) : 0;
  return s;
}

function cats(c) {
  return Object.entries(c).map(([k, v]) => `${k}:${v}`).join(", ") || "-";
}

function table(title, rows) {
  const lines = [`## ${title}`, "", "| key | runs | product | exact | avg ms | avg tool I/O | avg calls | outcomes |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"];
  for (const [key, s] of rows) {
    lines.push(`| ${key} | ${s.total} | ${s.product_success}/${s.total} | ${s.exact}/${s.total} | ${s.avg_duration_ms} | ${s.avgToolIoChars} | ${s.avgToolCalls} | ${cats(s.outcomeCategories)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.inputs.length === 0) {
    console.log(usage());
    return;
  }

  const loaded = args.inputs.map(readResult);
  const byMode = new Map();
  const byTask = new Map();
  const byModeTask = new Map();

  for (const run of loaded) {
    for (const r of run.results || []) {
      if (!byMode.has(r.mode)) byMode.set(r.mode, empty());
      add(byMode.get(r.mode), r);
      if (!byTask.has(r.task)) byTask.set(r.task, empty());
      add(byTask.get(r.task), r);
      const mt = `${r.mode} / ${r.task}`;
      if (!byModeTask.has(mt)) byModeTask.set(mt, empty());
      add(byModeTask.get(mt), r);
    }
  }

  for (const m of [byMode, byTask, byModeTask]) {
    for (const [k, v] of m) m.set(k, finish(v));
  }

  const summary = {
    inputs: loaded.map((r) => r.file),
    byMode: Object.fromEntries(byMode),
    byTask: Object.fromEntries(byTask),
    byModeTask: Object.fromEntries(byModeTask),
  };

  const md = [
    "# Product benchmark aggregate summary",
    "",
    "Inputs:",
    ...summary.inputs.map((i) => `- ${i}`),
    "",
    table("By mode", [...byMode.entries()].sort()),
    table("By task", [...byTask.entries()].sort()),
    table("By mode/task", [...byModeTask.entries()].sort()),
  ].join("\n");

  if (args.out) fs.writeFileSync(args.out, md);
  console.log(JSON.stringify(summary, null, 2));
  if (args.out) console.error(`Wrote ${args.out}`);
}

main();
