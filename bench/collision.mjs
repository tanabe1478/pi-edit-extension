#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { hashlineHash, tagFor } from "../src/core.mjs";
import { buildPlan } from "./plan.mjs";

function parseArgs(argv) {
  const args = { path: null, samples: 20000 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--path") args.path = argv[++i];
    else if (argv[i] === "--samples") args.samples = Number(argv[++i]);
    else if (argv[i] === "--help") args.help = true;
  }
  return args;
}

function walk(p, out = []) {
  const st = fs.statSync(p);
  if (st.isFile()) { out.push(p); return out; }
  for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", "coverage"].includes(ent.name)) continue;
    const child = path.join(p, ent.name);
    if (ent.isDirectory()) walk(child, out);
    else if (ent.isFile()) out.push(child);
  }
  return out;
}

function readLinesFromPath(p) {
  const files = walk(p);
  const lines = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    if (text.includes("\0")) continue;
    for (const line of text.replace(/\r\n/g, "\n").split("\n")) lines.push(line);
  }
  return lines;
}

function mutate(line, i) {
  const variants = [
    `${line} `,
    `${line} // ${i}`,
    line.replace(/[a-zA-Z]/, (c) => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()),
    line + String(i % 10),
    line.slice(0, Math.max(0, line.length - 1)),
  ];
  return variants[i % variants.length];
}

function analyze(lines, samples) {
  const buckets = new Map();
  for (const line of lines) {
    const h = hashlineHash(line);
    const b = buckets.get(h) || { count: 0, examples: [] };
    b.count++;
    if (b.examples.length < 3 && !b.examples.includes(line)) b.examples.push(line);
    buckets.set(h, b);
  }
  let mutatedSame = 0;
  let taggedSame = 0;
  for (let i = 0; i < samples; i++) {
    const line = lines[i % lines.length] ?? `line ${i}`;
    const m = mutate(line, i);
    if (m !== line && hashlineHash(m) === hashlineHash(line)) mutatedSame++;
    if (m !== line && tagFor(m, 4) === tagFor(line, 4)) taggedSame++;
  }
  const bucketCounts = [...buckets.values()].map((b) => b.count);
  const collisionBuckets = bucketCounts.filter((n) => n > 1).length;
  return {
    lines: lines.length,
    uniqueHashlineHashes: buckets.size,
    collisionBuckets,
    maxBucket: Math.max(...bucketCounts, 0),
    mutationSamples: samples,
    hashlineMutationSame: mutatedSame,
    hashlineMutationSameRate: Number((mutatedSame / samples).toFixed(4)),
    tagged4MutationSame: taggedSame,
    tagged4MutationSameRate: Number((taggedSame / samples).toFixed(6)),
    busiest: [...buckets.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([hash, b]) => ({ hash, count: b.count, examples: b.examples })),
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node bench/collision.mjs [--path DIR_OR_FILE] [--samples N]");
  process.exit(0);
}
const lines = args.path ? readLinesFromPath(path.resolve(args.path)) : buildPlan().fixture.text.split("\n");
console.log(JSON.stringify(analyze(lines, args.samples), null, 2));
