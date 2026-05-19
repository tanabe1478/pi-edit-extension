#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  estimateJsonChars,
  estimateTokensFromChars,
  formatHashlineAnchor,
  splitLinesPreserveFinalNewline,
  tagFor,
} from "../src/core.mjs";

function readMaybe(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return undefined; }
}

function makeFixture(lines) {
  const out = [];
  for (let i = 1; i <= lines; i++) {
    if (i % 7 === 0) out.push(`  if (items[${i}].enabled && limit > ${i}) { total += compute(items[${i}], limit); }`);
    else if (i % 5 === 0) out.push(`  const value_${i} = normalize(input.value_${i} ?? defaultValue);`);
    else out.push(`  // filler line ${i} with moderately long context and indentation`);
  }
  return out.join("\n") + "\n";
}

function taggedSpec(text, start, end, tagChars = 4) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const n = start + i;
    return `${n}:${tagFor(lines[n - 1], tagChars)}`;
  }).join("\n");
}

function hashlinePatch(text, start, end, newText, op = "replace") {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const a = formatHashlineAnchor(start, lines[start - 1]);
  const b = formatHashlineAnchor(end, lines[end - 1]);
  if (op === "delete") return `@@ fixture.ts\n- ${a}..${b}`;
  const payload = newText.length ? "\n" + newText.split("\n").map((line) => `~${line}`).join("\n") : "";
  return `@@ fixture.ts\n= ${a}..${b}${payload}`;
}

function scenario(name, text, start, end, newText) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const oldText = lines.slice(start - 1, end).join("\n");
  const op = newText === "" ? "delete" : "replace";
  const piEdit = { path: "fixture.ts", edits: [{ oldText, newText }] };
  const payloads = {
    old_new: { path: "fixture.ts", edits: [{ oldText, newText }] },
    pi_edit: piEdit,
    tagged: { path: "fixture.ts", edits: [{ lines: taggedSpec(text, start, end), newText }] },
    hashline: { input: hashlinePatch(text, start, end, newText, op) },
    crc: { path: "fixture.ts", fileCrc32: "12345678", startLine: start, endLine: end, newText },
  };
  const metrics = Object.fromEntries(Object.entries(payloads).map(([k, v]) => {
    const chars = estimateJsonChars(v);
    return [k, { chars, tokens_est: estimateTokensFromChars(chars) }];
  }));
  return { name, start, end, edited_lines: end - start + 1, payloads, metrics };
}

export function buildPlan() {
  const fixture = makeFixture(240);
  const scenarios = [
    scenario("one-line replacement", fixture, 10, 10, "  const value_10 = normalizeFast(input.value_10);"),
    scenario("small block replacement", fixture, 35, 39, "  total += computeWindow(items, 35, 39, limit);"),
    scenario("large deletion", fixture, 80, 139, ""),
    scenario("large replacement", fixture, 150, 220, "  return summarize(items, limit);"),
  ];
  return { version: 1, fixture: { path: "fixture.ts", text: fixture }, scenarios };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildPlan();
  const file = process.argv[2];
  if (file) fs.writeFileSync(file, JSON.stringify(out, null, 2));
  else console.log(JSON.stringify(out, null, 2));

  const omp = process.env.OH_MY_PI_DIR;
  if (omp) {
    const docs = readMaybe(path.join(omp, "docs/tools/edit.md"));
    const hash = readMaybe(path.join(omp, "packages/coding-agent/src/hashline/hash.ts"));
    console.error(JSON.stringify({
      oh_my_pi_dir: omp,
      found: Boolean(docs && hash),
      edit_doc: docs ? "docs/tools/edit.md" : null,
      hash_impl: hash ? "packages/coding-agent/src/hashline/hash.ts" : null,
    }));
  }
}
