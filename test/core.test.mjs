import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHashline,
  formatHashlineAnchor,
  formatTagged,
  parseTaggedLines,
  splitLinesPreserveFinalNewline,
  tagFor,
  validateAndApplyHashlinePatch,
  validateAndApplyTaggedEdits,
} from "../src/core.mjs";

test("formatTagged emits line:tag content", () => {
  const res = formatTagged("a\nb\n", { tagChars: 4 });
  assert.match(res.text, /^1:[A-Za-z0-9_-]{4} a\n2:[A-Za-z0-9_-]{4} b$/);
});

test("single-line tagged edit applies when tag matches", () => {
  const before = "const x = 1;\nconst y = 2;\n";
  const tag = tagFor("const x = 1;");
  const res = validateAndApplyTaggedEdits(before, [{ line: 1, tag, newText: "const x = 3;" }]);
  assert.equal(res.text, "const x = 3;\nconst y = 2;\n");
});

test("multi-line tagged edit deletes selected lines", () => {
  const before = "a\nb\nc\nd\n";
  const lines = `2:${tagFor("b")}\n3:${tagFor("c")}`;
  const res = validateAndApplyTaggedEdits(before, [{ lines, newText: "" }]);
  assert.equal(res.text, "a\nd\n");
});

test("tag mismatch rejects stale edits", () => {
  assert.throws(
    () => validateAndApplyTaggedEdits("changed\n", [{ line: 1, tag: tagFor("old"), newText: "new" }]),
    /tag mismatch/,
  );
});

test("CRLF style is preserved", () => {
  const before = "a\r\nb\r\n";
  const parsed = splitLinesPreserveFinalNewline(before);
  assert.equal(parsed.eol, "\r\n");
  const res = validateAndApplyTaggedEdits(before, [{ line: 2, tag: tagFor("b"), newText: "c" }]);
  assert.equal(res.text, "a\r\nc\r\n");
});

test("parseTaggedLines parses line specs", () => {
  assert.deepEqual(parseTaggedLines("10:abcd\n11:EF_-") , [{ line: 10, tag: "abcd" }, { line: 11, tag: "EF_-" }]);
});

test("formatHashline emits compact LINEhh pipe format", () => {
  const res = formatHashline("a\nb\n");
  assert.match(res.text, /^1[a-z]{2}\|a\n2[a-z]{2}\|b$/);
});

test("hashline patch replaces and inserts by anchors", () => {
  const before = "alpha\nbeta\ngamma\n";
  const a1 = formatHashlineAnchor(1, "alpha");
  const a2 = formatHashlineAnchor(2, "beta");
  const patch = `@@ file.txt\n= ${a2}..${a2}\n~BETA\n+ ${a1}\n~inserted`;
  const res = validateAndApplyHashlinePatch(before, patch);
  assert.equal(res.text, "alpha\ninserted\nBETA\ngamma\n");
});

test("hashline patch rejects stale anchors", () => {
  const stale = formatHashlineAnchor(1, "old");
  assert.throws(() => validateAndApplyHashlinePatch("new\n", `@@ file.txt\n- ${stale}..${stale}`), /Anchor mismatch/);
});
