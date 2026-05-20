#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  estimateJsonChars,
  estimateTokensFromChars,
  formatHashlineRangeAnchors,
  splitLinesPreserveFinalNewline,
  tagFor,
} from "../src/core.mjs";

function readMaybe(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return undefined; }
}

function makeFixture(lines) {
  const out = [];
  out.push("export function fixture(items, input, limit, defaultValue) {");
  out.push("  let total = 0;");
  for (let i = 1; i <= lines; i++) {
    if (i % 17 === 0) out.push("  const repeated = normalize(input.shared ?? defaultValue);");
    else if (i % 11 === 0) out.push(`  const message_${i} = \`value:\${input.value_${i}} limit:\${limit}\`;`);
    else if (i % 7 === 0) out.push(`  if (items[${i}].enabled && limit > ${i}) { total += compute(items[${i}], limit); }`);
    else if (i % 5 === 0) out.push(`  const value_${i} = normalize(input.value_${i} ?? defaultValue);`);
    else out.push(`  // filler line ${i} with moderately long context and indentation`);
  }
  out.push("  return total;");
  out.push("}");
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
  const forceStrict = op === "delete" || end - start + 1 >= 20;
  const { startAnchor: a, endAnchor: b } = formatHashlineRangeAnchors(text, start, end, { strictMode: "auto", forceStrict });
  if (op === "delete") return `@@ fixture.ts\n- ${a}..${b}`;
  const payload = newText.length ? "\n" + newText.split("\n").map((line) => `~${line}`).join("\n") : "";
  return `@@ fixture.ts\n= ${a}..${b}${payload}`;
}

function scenario(name, text, start, end, newText) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const oldTextBody = lines.slice(start - 1, end).join("\n");
  const oldText = newText === "" && end < lines.length ? `${oldTextBody}\n` : oldTextBody;
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
    scenario("one-line replacement", fixture, 12, 12, "  const value_10 = normalizeFast(input.value_10);"),
    scenario("small block replacement", fixture, 37, 41, "  total += computeWindow(items, 35, 39, limit);"),
    scenario("large deletion", fixture, 82, 141, ""),
    scenario("large replacement", fixture, 152, 222, "  return summarize(items, limit);"),
    scenario("multi-line insertion-shaped replacement", fixture, 24, 24, "  const debug_22 = input.value_22 ?? defaultValue;\n  total += Number(debug_22) || 0;"),
    scenario("template-string replacement", fixture, 35, 35, "  const message_33 = formatMessage(input.value_33, limit);"),
    scenario("repeated-line exact target", fixture, 19, 19, "  const repeated = normalizeFast(input.shared ?? defaultValue);"),
    scenario("delete single repeated line", fixture, 36, 36, ""),
    scenario("replace block ending before repeated", fixture, 48, 53, "  total += computeWindow(items, 46, 51, limit);"),
    scenario("near eof replacement", fixture, 241, 241, "  return finalize(total, limit);"),
    scenario("file opener replacement", fixture, 1, 1, "export function fixtureOptimized(items, input, limit, defaultValue) {"),
    scenario("medium deletion", fixture, 180, 199, ""),
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
