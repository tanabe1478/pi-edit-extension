import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCodexPatch,
  formatCodexPatch,
  formatHashline,
  formatHashlineAnchor,
  formatTagged,
  parseTaggedLines,
  recoverHashlinePatchFromSnapshot,
  splitLinesPreserveFinalNewline,
  tagFor,
  validateAndApplyHashlinePatch,
  validateAndApplyTaggedEdits,
  xxHash32,
} from "../src/core.mjs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

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

test("xxHash32 matches Bun.hash.xxHash32 reference values", () => {
  assert.equal(xxHash32("", 0), 46947589);
  assert.equal(xxHash32("a", 0), 1426945110);
  assert.equal(xxHash32("hello", 0), 4211111929);
});

test("formatHashline emits adaptive strict LINEhh[:tag] pipe format", () => {
  const res = formatHashline("a\nb\n");
  assert.match(res.text, /^1[a-z]{2}:[A-Za-z0-9_-]{4}\|a\n2[a-z]{2}:[A-Za-z0-9_-]{4}\|b$/);
  const compact = formatHashline("long enough unique line\nanother unique line\n", { strictMode: "none" });
  assert.match(compact.text, /^1[a-z]{2}\|long enough unique line\n2[a-z]{2}\|another unique line$/);
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
  assert.throws(() => validateAndApplyHashlinePatch("new\n", `@@ file.txt\n= ${stale}..${stale}\n~replacement`), /Edit rejected/);
});

test("documents 2-char hashline false-accept collision risk", () => {
  const oldLine = "collision candidate 8";
  const collidingCurrentLine = "collision candidate 35";
  const oldAnchor = formatHashlineAnchor(1, oldLine);
  assert.equal(formatHashlineAnchor(1, collidingCurrentLine), oldAnchor);
  const patch = `@@ file.txt\n= ${oldAnchor}..${oldAnchor}\n~patched`;
  const res = validateAndApplyHashlinePatch(`${collidingCurrentLine}\n`, patch);
  assert.equal(res.text, "patched\n");
});

test("strict hashline anchor rejects 2-char false-accept collision", () => {
  const oldLine = "collision candidate 8";
  const collidingCurrentLine = "collision candidate 35";
  const strictAnchor = formatHashlineAnchor(1, oldLine, { strict: true });
  assert.match(strictAnchor, /^1[a-z]{2}:[A-Za-z0-9_-]{4}$/);
  const patch = `@@ file.txt\n= ${strictAnchor}..${strictAnchor}\n~patched`;
  assert.throws(() => validateAndApplyHashlinePatch(`${collidingCurrentLine}\n`, patch), /Edit rejected/);
});

test("wide destructive hashline ranges require strict anchors", () => {
  const text = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const a = formatHashlineAnchor(1, "line 1");
  const b = formatHashlineAnchor(25, "line 25");
  assert.throws(() => validateAndApplyHashlinePatch(text, `@@ file.txt\n- ${a}..${b}`), /Strict anchors required/);
});

test("hashline recovery applies cached edit across unrelated current changes", () => {
  const snapshot = "a\nb\nc\n";
  const current = "intro\na\nb\nc\n";
  const anchor = formatHashlineAnchor(2, "b");
  const patch = `@@ file.txt\n= ${anchor}..${anchor}\n~B`;
  const res = recoverHashlinePatchFromSnapshot(snapshot, current, patch);
  assert.equal(res.text, "intro\na\nB\nc\n");
  assert.equal(res.recovered, true);
});

test("hashline recovery rejects ambiguous current segments", () => {
  const snapshot = "a\nb\nc\n";
  const current = "a\nb\nc\na\nb\nc\n";
  const anchor = formatHashlineAnchor(2, "b");
  const patch = `@@ file.txt\n= ${anchor}..${anchor}\n~B`;
  assert.throws(() => recoverHashlinePatchFromSnapshot(snapshot, current, patch), /matched 2 locations/);
});

test("formatCodexPatch emits apply_patch style context diff", () => {
  const patch = formatCodexPatch("file.txt", "a\nb\nc\n", 2, 2, "B", { context: 1 });
  assert.equal(patch, "*** Begin Patch\n*** Update File: file.txt\n@@\n a\n-b\n+B\n c\n*** End Patch");
});

test("applyCodexPatch applies context diff", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-patch-test-"));
  await fs.writeFile(path.join(dir, "file.txt"), "a\nb\nc\n", "utf8");
  const patch = formatCodexPatch("file.txt", "a\nb\nc\n", 2, 2, "B", { context: 1 });
  const result = await applyCodexPatch(patch, { cwd: dir });
  assert.equal(result.results[0].kind, "update");
  assert.equal(await fs.readFile(path.join(dir, "file.txt"), "utf8"), "a\nB\nc\n");
});

test("applyCodexPatch rejects missing old context", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-patch-test-"));
  await fs.writeFile(path.join(dir, "file.txt"), "a\nchanged\nc\n", "utf8");
  const patch = formatCodexPatch("file.txt", "a\nb\nc\n", 2, 2, "B", { context: 1 });
  await assert.rejects(() => applyCodexPatch(patch, { cwd: dir }), /Failed to find expected lines/);
});
