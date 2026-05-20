#!/usr/bin/env node
import {
  formatHashlineAnchor,
  strictHashlineTag,
  tagFor,
  validateAndApplyHashlineRangeEdit,
  validateAndApplyTaggedEdits,
} from "../src/core.mjs";

function row(name, first, fallback, final, expected, detail = "") {
  return { name, first, fallback, final, expected, pass: final === expected, detail };
}

async function staleStrictHashlineThenTagged() {
  const name = "stale strict hashline rejects then tagged succeeds";
  const readLine = "collision candidate 8";
  const currentLine = "collision candidate 35";
  const current = `${currentLine}\n`;
  const strict = `${formatHashlineAnchor(1, readLine)}:${strictHashlineTag(readLine)}`;
  let first = "apply";
  try {
    validateAndApplyHashlineRangeEdit(current, { path: "file.txt", start: strict, end: strict, newText: "patched" });
  } catch (err) {
    first = "reject";
  }
  let fallback = "not_run";
  let final = "not_run";
  let detail = "";
  if (first === "reject") {
    try {
      const res = validateAndApplyTaggedEdits(current, [{ line: 1, tag: tagFor(currentLine), newText: "patched" }]);
      fallback = "apply";
      final = res.text === "patched\n" ? "success" : "wrong_output";
      detail = res.text.trim();
    } catch (err) {
      fallback = "reject";
      final = "fail";
      detail = err.message;
    }
  }
  return row(name, first, fallback, final, "success", detail);
}

async function destructivePlainHashlineThenTagged() {
  const name = "plain destructive hashline rejects then tagged succeeds";
  const current = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const plainA = formatHashlineAnchor(1, "line 1");
  const plainB = formatHashlineAnchor(25, "line 25");
  let first = "apply";
  try {
    validateAndApplyHashlineRangeEdit(current, { path: "file.txt", start: plainA, end: plainB, newText: "" });
  } catch (err) {
    first = "reject";
  }
  let fallback = "not_run";
  let final = "not_run";
  let detail = "";
  if (first === "reject") {
    try {
      const lines = Array.from({ length: 25 }, (_, i) => `${i + 1}:${tagFor(`line ${i + 1}`)}`).join("\n");
      const res = validateAndApplyTaggedEdits(current, [{ lines, newText: "" }]);
      fallback = "apply";
      final = res.text === "\n" ? "success" : "wrong_output";
      detail = `${res.text.length} chars`;
    } catch (err) {
      fallback = "reject";
      final = "fail";
      detail = err.message;
    }
  }
  return row(name, first, fallback, final, "success", detail);
}

async function main() {
  const rows = [await staleStrictHashlineThenTagged(), await destructivePlainHashlineThenTagged()];
  console.table(rows.map(({ name, first, fallback, final, expected, pass }) => ({ name, first, fallback, final, expected, pass })));
  for (const r of rows) console.log(JSON.stringify(r));
  const failed = rows.filter((r) => !r.pass);
  if (failed.length) {
    console.error(`${failed.length} fallback expectation(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
