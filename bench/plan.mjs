#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  estimateJsonChars,
  estimateTokensFromChars,
  formatCodexPatch,
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

function hashlinePatch(text, start, end, newText, op = "replace", opts = {}) {
  const forceStrict = opts.forceStrict ?? (op === "delete" || end - start + 1 >= 20);
  const { startAnchor: a, endAnchor: b } = formatHashlineRangeAnchors(text, start, end, { strictMode: opts.strictMode ?? "auto", forceStrict });
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
    codex_patch: { input: formatCodexPatch("fixture.ts", text, start, end, newText) },
    hashline_legacy: { input: hashlinePatch(text, start, end, newText, op, { strictMode: "none", forceStrict: false }) },
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
    // Original 12-task suite retained for continuity.
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

    // Additional narrow replacements across different line shapes.
    scenario("early accumulator replacement", fixture, 2, 2, "  let total = Number(input.initialTotal ?? 0);"),
    scenario("normalize value replacement", fixture, 7, 7, "  const value_5 = normalizeFast(input.value_5 ?? defaultValue);"),
    scenario("if compute line replacement", fixture, 23, 23, "  if (items[21]?.enabled && limit > 21) total += computeChecked(items[21], limit);"),
    scenario("late value replacement", fixture, 152, 152, "  const value_150 = normalizeFast(input.value_150 ?? defaultValue);"),
    scenario("late template replacement", fixture, 222, 222, "  const message_220 = formatMessage(input.value_220, limit);"),
    scenario("return line replacement", fixture, 243, 243, "  return clamp(total, limit);"),

    // Small and medium block edits.
    scenario("two-line setup replacement", fixture, 1, 2, "export function fixtureV2(items, input, limit, defaultValue) {\n  let total = Number(input.initialTotal ?? 0);"),
    scenario("three-line mixed replacement", fixture, 21, 23, "  const value_19 = normalizeFast(input.value_19 ?? defaultValue);\n  const message_20 = formatMessage(input.value_20, limit);\n  total += computeIfEnabled(items[21], limit);"),
    scenario("ten-line compaction", fixture, 60, 69, "  total += computeWindow(items, 58, 67, limit);"),
    scenario("fifteen-line replacement", fixture, 100, 114, "  total += computeWindow(items, 98, 112, limit);"),
    scenario("block containing repeated line", fixture, 68, 72, "  total += computeSharedWindow(items, input.shared, defaultValue);"),
    scenario("block across template and if", fixture, 132, 138, "  total += computeWindow(items, 130, 136, limit);"),
    scenario("near eof small block", fixture, 239, 244, "  return finalize(total, limit);\n}"),

    // Deletions of different sizes, including repeated and near-boundary regions.
    scenario("delete short filler block", fixture, 3, 6, ""),
    scenario("delete repeated window", fixture, 68, 72, ""),
    scenario("delete ten lines", fixture, 120, 129, ""),
    scenario("delete nineteen lines below strict threshold", fixture, 200, 218, ""),
    scenario("delete twenty one lines strict threshold", fixture, 30, 50, ""),
    scenario("delete tail block", fixture, 230, 242, ""),

    // Insertion-shaped replacements that expand a single line into multiple lines.
    scenario("expand value line to guard", fixture, 17, 17, "  const raw_15 = input.value_15 ?? defaultValue;\n  const value_15 = normalizeFast(raw_15);\n  total += score(value_15);"),
    scenario("expand repeated line to cached shared", fixture, 70, 70, "  const shared = input.shared ?? defaultValue;\n  const repeated = normalizeFast(shared);"),
    scenario("expand if line to block", fixture, 100, 100, "  if (items[98]?.enabled && limit > 98) {\n    total += computeChecked(items[98], limit);\n  }"),
    scenario("expand template to object", fixture, 112, 112, "  const message_110 = formatMessage(input.value_110, limit);\n  const record_110 = { message: message_110, limit };"),

    // Repeated-target ambiguity stress cases.
    scenario("replace second repeated line", fixture, 53, 53, "  const repeated = normalizeFast(input.shared ?? defaultValue);"),
    scenario("replace later repeated line", fixture, 87, 87, "  const repeated = normalizeCached(input.shared ?? defaultValue);"),
    scenario("delete later repeated line", fixture, 121, 121, ""),
    scenario("replace repeated-adjacent filler", fixture, 52, 52, "  // shared normalization follows; keep adjacent context stable"),

    // Larger replacements and deletions for token-scaling behavior.
    scenario("thirty-line summarization", fixture, 50, 79, "  total += summarizeWindow(items, input, 48, 77, limit);"),
    scenario("forty-line deletion", fixture, 150, 189, ""),
    scenario("hundred-line replacement", fixture, 40, 139, "  total += summarizeLargeWindow(items, input, limit);"),
    scenario("hundred-line deletion", fixture, 40, 139, ""),
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
