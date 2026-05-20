#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  applyCodexPatch,
  crc32,
  formatCodexPatch,
  formatHashlineAnchor,
  strictHashlineTag,
  tagFor,
  validateAndApplyHashlinePatch,
  validateAndApplyTaggedEdits,
} from "../src/core.mjs";

function ok(name, mode, outcome, expected, detail = "") {
  return { name, mode, outcome, expected, pass: outcome === expected, detail };
}

function applyPiEdit(text, oldText, newText) {
  const idx = text.indexOf(oldText);
  if (idx < 0) throw new Error("oldText not found");
  if (text.indexOf(oldText, idx + oldText.length) >= 0) throw new Error("oldText is ambiguous");
  return text.slice(0, idx) + newText + text.slice(idx + oldText.length);
}

function applyCrcRange(text, expectedCrc, startLine, endLine, newText) {
  const actual = crc32(text).toString(16).padStart(8, "0");
  if (actual !== expectedCrc) throw new Error(`fileCrc32 mismatch: expected ${expectedCrc}, actual ${actual}`);
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  const replacement = newText.length ? newText.split("\n") : [];
  lines.splice(startLine - 1, endLine - startLine + 1, ...replacement);
  return lines.join("\n") + "\n";
}

async function applyCodexInTemp(text, patchText) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-edit-failure-"));
  await fs.writeFile(path.join(dir, "file.txt"), text, "utf8");
  await applyCodexPatch(patchText, { cwd: dir });
  return fs.readFile(path.join(dir, "file.txt"), "utf8");
}

async function runSameLineHashCollision() {
  const name = "same-line 2-char hash collision";
  const oldLine = "collision candidate 8";
  const currentLine = "collision candidate 35";
  const current = `${currentLine}\n`;
  const desired = "patched\n";
  const plain = formatHashlineAnchor(1, oldLine);
  const strict = `${plain}:${strictHashlineTag(oldLine)}`;
  const codexPatch = formatCodexPatch("file.txt", `${oldLine}\n`, 1, 1, "patched", { context: 0 });
  const results = [];

  for (const [mode, fn, expected] of [
    ["pi_edit", () => applyPiEdit(current, `${oldLine}\n`, desired), "reject"],
    ["tagged", () => validateAndApplyTaggedEdits(current, [{ line: 1, tag: tagFor(oldLine), newText: "patched" }]).text, "reject"],
    ["codex_patch", () => applyCodexInTemp(current, codexPatch), "reject"],
    ["hashline_legacy", () => validateAndApplyHashlinePatch(current, `@@ file.txt\n= ${plain}..${plain}\n~patched`).text, "false_accept"],
    ["hashline", () => validateAndApplyHashlinePatch(current, `@@ file.txt\n= ${strict}..${strict}\n~patched`).text, "reject"],
    ["crc", () => applyCrcRange(current, crc32(`${oldLine}\n`).toString(16).padStart(8, "0"), 1, 1, "patched"), "reject"],
  ]) {
    try {
      const out = await fn();
      results.push(ok(name, mode, out === desired ? "false_accept" : "apply_other", expected, out.trim()));
    } catch (err) {
      results.push(ok(name, mode, "reject", expected, err.message));
    }
  }
  return results;
}

async function runDestructiveRangeRequiresStrict() {
  const name = "destructive range without strict endpoints";
  const current = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const plainA = formatHashlineAnchor(1, "line 1");
  const plainB = formatHashlineAnchor(25, "line 25");
  const strictA = formatHashlineAnchor(1, "line 1", { strict: true });
  const strictB = formatHashlineAnchor(25, "line 25", { strict: true });
  const desired = "";
  const results = [];
  for (const [mode, patch, expected] of [
    ["hashline_legacy", `@@ file.txt\n- ${plainA}..${plainB}`, "apply"],
    ["hashline", `@@ file.txt\n- ${plainA}..${plainB}`, "reject"],
    ["hashline_strict_endpoints", `@@ file.txt\n- ${strictA}..${strictB}`, "apply"],
  ]) {
    try {
      const out = validateAndApplyHashlinePatch(current, patch, { requireStrictRanges: mode !== "hashline_legacy" }).text;
      results.push(ok(name, mode, out.trim() === desired ? "apply" : "apply_other", expected, `${out.length} chars`));
    } catch (err) {
      results.push(ok(name, mode, "reject", expected, err.message));
    }
  }
  return results;
}

async function runCrcUnrelatedChange() {
  const name = "whole-file CRC invalidated by unrelated change";
  const readText = "target\nunchanged\n";
  const current = "target\nchanged elsewhere\n";
  const expectedCrc = crc32(readText).toString(16).padStart(8, "0");
  try {
    applyCrcRange(current, expectedCrc, 1, 1, "patched");
    return [ok(name, "crc", "apply", "reject")];
  } catch (err) {
    return [ok(name, "crc", "reject", "reject", err.message)];
  }
}

async function runCodexFuzzyBoundary() {
  const name = "Codex fuzzy whitespace boundary";
  const readText = "alpha\n  beta\ngamma\n";
  const trimDrift = "alpha\nbeta   \ngamma\n";
  const semanticDrift = "alpha\nbeta changed\ngamma\n";
  const patch = formatCodexPatch("file.txt", readText, 2, 2, "BETA", { context: 1 });
  const results = [];
  for (const [mode, text, expected] of [
    ["codex_patch_trim_drift", trimDrift, "apply"],
    ["codex_patch_semantic_drift", semanticDrift, "reject"],
  ]) {
    try {
      const out = await applyCodexInTemp(text, patch);
      results.push(ok(name, mode, out.includes("BETA") ? "apply" : "apply_other", expected, out.trim()));
    } catch (err) {
      results.push(ok(name, mode, "reject", expected, err.message));
    }
  }
  return results;
}

async function main() {
  const groups = await Promise.all([
    runSameLineHashCollision(),
    runDestructiveRangeRequiresStrict(),
    runCrcUnrelatedChange(),
    runCodexFuzzyBoundary(),
  ]);
  const rows = groups.flat();
  console.table(rows.map(({ name, mode, outcome, expected, pass }) => ({ name, mode, outcome, expected, pass })));
  for (const row of rows) console.log(JSON.stringify(row));
  const failed = rows.filter((r) => !r.pass);
  if (failed.length) {
    console.error(`${failed.length} failure-suite expectation(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
