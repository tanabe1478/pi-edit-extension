import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import bigrams from "../vendor/oh-my-pi/bigrams.json" with { type: "json" };

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(s) {
  const b = Buffer.from(s, "utf8");
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC32_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const XXH_PRIME32_1 = 0x9e3779b1;
const XXH_PRIME32_2 = 0x85ebca77;
const XXH_PRIME32_3 = 0xc2b2ae3d;
const XXH_PRIME32_4 = 0x27d4eb2f;
const XXH_PRIME32_5 = 0x165667b1;

const rotl32 = (x, r) => ((x << r) | (x >>> (32 - r))) >>> 0;
const readU32LE = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

function xxh32Round(acc, lane) {
  acc = (acc + Math.imul(lane, XXH_PRIME32_2)) >>> 0;
  acc = rotl32(acc, 13);
  return Math.imul(acc, XXH_PRIME32_1) >>> 0;
}

/** Node-compatible xxHash32 implementation matching Bun.hash.xxHash32(input, seed). */
export function xxHash32(s, seed = 0) {
  const b = Buffer.from(s, "utf8");
  let i = 0;
  let h;
  if (b.length >= 16) {
    let v1 = (seed + XXH_PRIME32_1 + XXH_PRIME32_2) >>> 0;
    let v2 = (seed + XXH_PRIME32_2) >>> 0;
    let v3 = seed >>> 0;
    let v4 = (seed - XXH_PRIME32_1) >>> 0;
    const limit = b.length - 16;
    while (i <= limit) {
      v1 = xxh32Round(v1, readU32LE(b, i)); i += 4;
      v2 = xxh32Round(v2, readU32LE(b, i)); i += 4;
      v3 = xxh32Round(v3, readU32LE(b, i)); i += 4;
      v4 = xxh32Round(v4, readU32LE(b, i)); i += 4;
    }
    h = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
  } else {
    h = (seed + XXH_PRIME32_5) >>> 0;
  }
  h = (h + b.length) >>> 0;
  while (i <= b.length - 4) {
    h = (h + Math.imul(readU32LE(b, i), XXH_PRIME32_3)) >>> 0;
    h = Math.imul(rotl32(h, 17), XXH_PRIME32_4) >>> 0;
    i += 4;
  }
  while (i < b.length) {
    h = (h + Math.imul(b[i], XXH_PRIME32_5)) >>> 0;
    h = Math.imul(rotl32(h, 11), XXH_PRIME32_1) >>> 0;
    i++;
  }
  h ^= h >>> 15;
  h = Math.imul(h, XXH_PRIME32_2) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, XXH_PRIME32_3) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function tagFor(line, chars = 4, salt = "") {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32BE(crc32(`${salt}${line}`), 0);
  return buf.toString("base64url").slice(0, chars);
}

export const HASHLINE_BIGRAMS = bigrams;

export function hashlineHash(line) {
  // Matches oh-my-pi's normalization and hashing: content-only hash, CR removed,
  // trailing whitespace ignored, xxHash32(seed=0), mapped to the curated
  // single-token lowercase bigram table.
  const normalized = line.replace(/\r/g, "").trimEnd();
  return HASHLINE_BIGRAMS[xxHash32(normalized, 0) % HASHLINE_BIGRAMS.length];
}

export function strictHashlineTag(line, chars = 4) {
  return tagFor(line.replace(/\r/g, "").trimEnd(), chars);
}

export function formatHashlineAnchor(lineNumber, line, opts = {}) {
  const base = `${lineNumber}${hashlineHash(line)}`;
  return opts.strict ? `${base}:${strictHashlineTag(line, opts.strictChars ?? 4)}` : base;
}

export function formatHashlineLine(lineNumber, line, opts = {}) {
  return `${formatHashlineAnchor(lineNumber, line, opts)}|${line}`;
}

export function analyzeHashlineStrictLines(lines, opts = {}) {
  const mode = opts.strictMode ?? "auto";
  const strict = new Set();
  if (mode === "none") return strict;
  if (mode === "all") {
    for (let i = 1; i <= lines.length; i++) strict.add(i);
    return strict;
  }
  const hashCounts = new Map();
  const textCounts = new Map();
  for (const line of lines) {
    hashCounts.set(hashlineHash(line), (hashCounts.get(hashlineHash(line)) ?? 0) + 1);
    const normalized = line.replace(/\r/g, "").trimEnd();
    textCounts.set(normalized, (textCounts.get(normalized) ?? 0) + 1);
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = line.replace(/\r/g, "").trimEnd();
    const content = normalized.trim();
    const lowInformation = content.length <= 2 || /^[{}()[\],.;:]*$/.test(content);
    const repeatedText = (textCounts.get(normalized) ?? 0) > 1;
    const collidedHash = (hashCounts.get(hashlineHash(line)) ?? 0) > 1;
    if (lowInformation || repeatedText || collidedHash) strict.add(i + 1);
  }
  return strict;
}

export function expandPath(p) {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}

export function resolveUserPath(p, cwd = process.cwd()) {
  const expanded = expandPath(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

export function splitLinesPreserveFinalNewline(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const finalNewline = normalized.endsWith("\n");
  const body = finalNewline ? normalized.slice(0, -1) : normalized;
  return { lines: body.length ? body.split("\n") : [], finalNewline, eol };
}

export function joinLines(lines, finalNewline, eol) {
  const body = lines.join(eol);
  return body + (finalNewline ? eol : "");
}

export function parseTaggedLines(spec) {
  return spec
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(\d+)\s*:\s*([A-Za-z0-9_-]+)$/.exec(s);
      if (!m) throw new Error(`Invalid tagged line spec: ${s}`);
      return { line: Number(m[1]), tag: m[2] };
    });
}

export function formatTagged(text, opts = {}) {
  const { offset = 1, limit, tagChars = 4, saltMode = "none" } = opts;
  const { lines } = splitLinesPreserveFinalNewline(text);
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, limit ? start + limit - 1 : lines.length);
  const out = [];
  for (let n = start; n <= end; n++) {
    const line = lines[n - 1] ?? "";
    const salt = saltMode === "line" ? `${n}:` : "";
    out.push(`${n}:${tagFor(line, tagChars, salt)} ${line}`);
  }
  return { text: out.join("\n"), start, end, totalLines: lines.length };
}

export function formatHashline(text, opts = {}) {
  const { offset = 1, limit, strictMode = "auto", strictChars = 4 } = opts;
  const { lines } = splitLinesPreserveFinalNewline(text);
  const strictLines = analyzeHashlineStrictLines(lines, { strictMode });
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, limit ? start + limit - 1 : lines.length);
  const out = [];
  for (let n = start; n <= end; n++) out.push(formatHashlineLine(n, lines[n - 1] ?? "", { strict: strictLines.has(n), strictChars }));
  return { text: out.join("\n"), start, end, totalLines: lines.length, strictLines: [...strictLines] };
}

export function formatHashlineRangeAnchors(text, start, end, opts = {}) {
  const { strictMode = "auto", strictChars = 4, forceStrict = false } = opts;
  const { lines } = splitLinesPreserveFinalNewline(text);
  const strictLines = analyzeHashlineStrictLines(lines, { strictMode });
  const useStrict = (n) => forceStrict || strictLines.has(n);
  return {
    startAnchor: formatHashlineAnchor(start, lines[start - 1] ?? "", { strict: useStrict(start), strictChars }),
    endAnchor: formatHashlineAnchor(end, lines[end - 1] ?? "", { strict: useStrict(end), strictChars }),
  };
}

export function parseHashlineAnchor(anchor) {
  const trimmed = String(anchor).trim();
  if (trimmed === "BOF" || trimmed === "EOF") return { special: trimmed };
  const m = /^(\d+)([a-z]{2})(?::([A-Za-z0-9_-]{4,8}))?$/.exec(trimmed);
  if (!m) throw new Error(`Invalid hashline anchor: ${anchor}`);
  return { line: Number(m[1]), hash: m[2], strict: m[3] };
}

export class HashlineMismatchError extends Error {
  constructor(mismatches, lines) {
    super(formatHashlineMismatch(mismatches, lines));
    this.name = "HashlineMismatchError";
    this.mismatches = mismatches;
  }
}

export function formatHashlineMismatch(mismatches, lines, context = 2) {
  const wanted = new Set(mismatches.map((m) => m.line));
  const display = new Set();
  for (const m of mismatches) {
    for (let n = Math.max(1, m.line - context); n <= Math.min(lines.length, m.line + context); n++) display.add(n);
  }
  const out = [
    `Edit rejected: ${mismatches.length} anchor${mismatches.length === 1 ? "" : "s"} did not match the current file.`,
    "The edit was NOT applied. Re-read the shown area and issue another edit.",
    "",
  ];
  let prev = 0;
  for (const n of [...display].sort((a, b) => a - b)) {
    if (prev && n > prev + 1) out.push("...");
    const mark = wanted.has(n) ? "*" : " ";
    out.push(`${mark}${formatHashlineLine(n, lines[n - 1] ?? "")}`);
    prev = n;
  }
  return out.join("\n");
}

function validateHashlineAnchor(anchor, lines, mismatches) {
  const parsed = parseHashlineAnchor(anchor);
  if (parsed.special) return parsed;
  const actual = lines[parsed.line - 1];
  if (actual === undefined) throw new Error(`Line ${parsed.line} is outside file`);
  const actualHash = hashlineHash(actual);
  if (actualHash !== parsed.hash) mismatches.push({ line: parsed.line, expected: parsed.hash, actual: actualHash });
  if (parsed.strict) {
    const actualStrict = strictHashlineTag(actual, parsed.strict.length);
    if (actualStrict !== parsed.strict) mismatches.push({ line: parsed.line, expected: `${parsed.hash}:${parsed.strict}`, actual: `${actualHash}:${actualStrict}` });
  }
  return parsed;
}

function parsePayload(lines, i, sep) {
  const payload = [];
  while (i < lines.length && lines[i].startsWith(sep)) payload.push(lines[i++].slice(sep.length));
  return { payload, next: i };
}

export function validateAndApplyHashlinePatch(text, patch, opts = {}) {
  const { payloadSep = "~" } = opts;
  const parsed = splitLinesPreserveFinalNewline(text);
  const patchLines = String(patch).replace(/\r\n/g, "\n").split("\n");
  const ops = [];
  const mismatches = [];
  for (let i = 0; i < patchLines.length; ) {
    const raw = patchLines[i].trimEnd();
    i++;
    if (!raw.trim() || raw.startsWith("@@") || raw === "*** Begin Patch" || raw === "*** End Patch") continue;
    const op = raw[0];
    const rest = raw.slice(1).trim();
    if (op === "+" || op === "<") {
      const anchor = validateHashlineAnchor(rest, parsed.lines, mismatches);
      const payload = parsePayload(patchLines, i, payloadSep);
      i = payload.next;
      ops.push({ kind: op === "+" ? "after" : "before", anchor, payload: payload.payload });
      continue;
    }
    if (op === "-" || op === "=") {
      const m = /^(.+)\.\.(.+)$/.exec(rest);
      if (!m) throw new Error(`Expected range A..B in op: ${raw}`);
      const a = validateHashlineAnchor(m[1], parsed.lines, mismatches);
      const b = validateHashlineAnchor(m[2], parsed.lines, mismatches);
      if (a.special || b.special) throw new Error(`Range anchors must be concrete lines: ${raw}`);
      if (a.line > b.line) throw new Error(`Range start must be <= end: ${raw}`);
      const destructiveOrWide = op === "-" || b.line - a.line + 1 >= (opts.strictRangeThreshold ?? 20);
      if (opts.requireStrictRanges !== false && destructiveOrWide && (!a.strict || !b.strict)) {
        throw new Error(`Strict anchors required for destructive or wide range edits (${raw}). Re-read with strictMode=auto/all and copy anchors including :tag.`);
      }
      const payload = op === "=" ? parsePayload(patchLines, i, payloadSep) : { payload: [], next: i };
      i = payload.next;
      ops.push({ kind: op === "-" ? "delete" : "replace", start: a.line, end: b.line, payload: payload.payload });
      continue;
    }
    throw new Error(`Unknown hashline op: ${raw}`);
  }

  if (mismatches.length) throw new HashlineMismatchError(mismatches, parsed.lines);

  const rangeOps = ops.filter((op) => op.kind === "delete" || op.kind === "replace").sort((a, b) => a.start - b.start);
  for (let i = 1; i < rangeOps.length; i++) if (rangeOps[i].start <= rangeOps[i - 1].end) throw new Error("Hashline range edits must not overlap");

  const out = parsed.lines.slice();
  const opPosition = (op) => {
    if (op.kind === "delete" || op.kind === "replace") return op.start;
    if (op.anchor.special === "EOF") return Number.POSITIVE_INFINITY;
    if (op.anchor.special === "BOF") return 0;
    return op.anchor.line;
  };
  for (const op of ops.slice().sort((a, b) => opPosition(b) - opPosition(a))) {
    if (op.kind === "delete" || op.kind === "replace") {
      out.splice(op.start - 1, op.end - op.start + 1, ...op.payload);
    } else if (op.kind === "before") {
      const idx = op.anchor.special === "BOF" ? 0 : op.anchor.special === "EOF" ? out.length : op.anchor.line - 1;
      out.splice(idx, 0, ...op.payload);
    } else if (op.kind === "after") {
      const idx = op.anchor.special === "BOF" ? 0 : op.anchor.special === "EOF" ? out.length : op.anchor.line;
      out.splice(idx, 0, ...op.payload);
    }
  }
  return { text: joinLines(out, parsed.finalNewline, parsed.eol), ops };
}

export function diffLineRange(beforeText, afterText) {
  const before = splitLinesPreserveFinalNewline(beforeText).lines;
  const after = splitLinesPreserveFinalNewline(afterText).lines;
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let beforeSuffix = before.length - 1;
  let afterSuffix = after.length - 1;
  while (beforeSuffix >= prefix && afterSuffix >= prefix && before[beforeSuffix] === after[afterSuffix]) {
    beforeSuffix--;
    afterSuffix--;
  }
  return {
    start: prefix,
    oldEnd: beforeSuffix + 1,
    newEnd: afterSuffix + 1,
    oldLines: before.slice(prefix, beforeSuffix + 1),
    newLines: after.slice(prefix, afterSuffix + 1),
  };
}

function findSubsequence(haystack, needle) {
  if (needle.length === 0) return [];
  const hits = [];
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

function findInsertionIndex(snapshotLines, currentLines, start) {
  const prev = start > 0 ? snapshotLines[start - 1] : undefined;
  const next = start < snapshotLines.length ? snapshotLines[start] : undefined;
  if (prev !== undefined) {
    const hits = findSubsequence(currentLines, [prev]);
    if (hits.length === 1) return hits[0] + 1;
  }
  if (next !== undefined) {
    const hits = findSubsequence(currentLines, [next]);
    if (hits.length === 1) return hits[0];
  }
  return undefined;
}

export function recoverHashlinePatchFromSnapshot(snapshotText, currentText, patch, opts = {}) {
  const desired = validateAndApplyHashlinePatch(snapshotText, patch, opts).text;
  const change = diffLineRange(snapshotText, desired);
  const snapshot = splitLinesPreserveFinalNewline(snapshotText);
  const current = splitLinesPreserveFinalNewline(currentText);
  let replaceStart;
  let replaceDeleteCount;

  if (change.oldLines.length > 0) {
    const hits = findSubsequence(current.lines, change.oldLines);
    if (hits.length !== 1) {
      throw new Error(`Recovery failed: changed old segment matched ${hits.length} locations in current file`);
    }
    replaceStart = hits[0];
    replaceDeleteCount = change.oldLines.length;
  } else {
    const idx = findInsertionIndex(snapshot.lines, current.lines, change.start);
    if (idx === undefined) throw new Error("Recovery failed: insertion anchor is ambiguous in current file");
    replaceStart = idx;
    replaceDeleteCount = 0;
  }

  const out = current.lines.slice();
  out.splice(replaceStart, replaceDeleteCount, ...change.newLines);
  return {
    text: joinLines(out, current.finalNewline, current.eol),
    recovered: true,
    changedOldLines: change.oldLines.length,
    changedNewLines: change.newLines.length,
    currentStartLine: replaceStart + 1,
  };
}

export function validateAndApplyTaggedEdits(text, edits, opts = {}) {
  const { tagChars = 4, saltMode = "none" } = opts;
  const parsed = splitLinesPreserveFinalNewline(text);
  const ranges = edits.map((edit, idx) => {
    const specs = edit.lines ? parseTaggedLines(edit.lines) : [{ line: edit.line, tag: edit.tag }];
    if (specs.some((s) => !s.line || !s.tag)) throw new Error(`Edit ${idx + 1}: provide either line+tag or lines`);
    const nums = specs.map((s) => s.line).sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1] + 1) throw new Error(`Edit ${idx + 1}: lines must be contiguous`);
    }
    for (const s of specs) {
      const actual = parsed.lines[s.line - 1];
      if (actual === undefined) throw new Error(`Edit ${idx + 1}: line ${s.line} is outside file`);
      const salt = saltMode === "line" ? `${s.line}:` : "";
      const actualTag = tagFor(actual, tagChars, salt);
      if (actualTag !== s.tag) {
        throw new Error(`Edit ${idx + 1}: line ${s.line} tag mismatch: expected ${s.tag}, actual ${actualTag}`);
      }
    }
    return { start: nums[0], end: nums[nums.length - 1], newText: edit.newText };
  });

  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start <= ranges[i - 1].end) throw new Error("Edits must not overlap");
  }

  const out = parsed.lines.slice();
  for (const r of ranges.slice().reverse()) {
    const repl = r.newText.length ? r.newText.replace(/\r\n/g, "\n").split("\n") : [];
    out.splice(r.start - 1, r.end - r.start + 1, ...repl);
  }
  return { text: joinLines(out, parsed.finalNewline, parsed.eol), ranges };
}

export function formatCodexPatch(pathName, text, start, end, newText, opts = {}) {
  const { context = 3 } = opts;
  const { lines } = splitLinesPreserveFinalNewline(text);
  const beforeStart = Math.max(1, start - context);
  const afterEnd = Math.min(lines.length, end + context);
  const replacement = newText.length ? newText.replace(/\r\n/g, "\n").split("\n") : [];
  const out = ["*** Begin Patch", `*** Update File: ${pathName}`, "@@"];
  for (let n = beforeStart; n < start; n++) out.push(` ${lines[n - 1] ?? ""}`);
  for (let n = start; n <= end; n++) out.push(`-${lines[n - 1] ?? ""}`);
  for (const line of replacement) out.push(`+${line}`);
  for (let n = end + 1; n <= afterEnd; n++) out.push(` ${lines[n - 1] ?? ""}`);
  out.push("*** End Patch");
  return out.join("\n");
}

function parseCodexPatch(patch) {
  const lines = String(patch).replace(/\r\n/g, "\n").trim().split("\n");
  if (lines[0]?.trim() !== "*** Begin Patch") throw new Error("Codex patch must start with *** Begin Patch");
  if (lines.at(-1)?.trim() !== "*** End Patch") throw new Error("Codex patch must end with *** End Patch");
  const ops = [];
  for (let i = 1; i < lines.length - 1; ) {
    const line = lines[i];
    if (line.startsWith("*** Update File: ")) {
      const pathName = line.slice("*** Update File: ".length).trim();
      i++;
      const chunks = [];
      while (i < lines.length - 1 && !lines[i].startsWith("*** ")) {
        let changeContext;
        if (lines[i] === "@@") i++;
        else if (lines[i]?.startsWith("@@ ")) { changeContext = lines[i].slice(3); i++; }
        else if (chunks.length) throw new Error(`Expected @@ hunk marker, got: ${lines[i]}`);
        const oldLines = [];
        const newLines = [];
        let isEndOfFile = false;
        while (i < lines.length - 1 && !lines[i].startsWith("@@") && !lines[i].startsWith("*** ")) {
          const raw = lines[i++];
          if (raw === "*** End of File") { isEndOfFile = true; break; }
          const sigil = raw[0];
          const body = raw.slice(1);
          if (sigil === " ") { oldLines.push(body); newLines.push(body); }
          else if (sigil === "-") oldLines.push(body);
          else if (sigil === "+") newLines.push(body);
          else if (raw === "") { oldLines.push(""); newLines.push(""); }
          else throw new Error(`Invalid codex hunk line: ${raw}`);
        }
        chunks.push({ changeContext, oldLines, newLines, isEndOfFile });
      }
      ops.push({ kind: "update", path: pathName, chunks });
      continue;
    }
    if (line.startsWith("*** Add File: ")) {
      const pathName = line.slice("*** Add File: ".length).trim();
      i++;
      const contents = [];
      while (i < lines.length - 1 && !lines[i].startsWith("*** ")) {
        if (!lines[i].startsWith("+")) throw new Error(`Add file lines must start with +: ${lines[i]}`);
        contents.push(lines[i++].slice(1));
      }
      ops.push({ kind: "add", path: pathName, contents });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      ops.push({ kind: "delete", path: line.slice("*** Delete File: ".length).trim() });
      i++;
      continue;
    }
    throw new Error(`Invalid codex patch file op: ${line}`);
  }
  return ops;
}

function normalizeCodexSeek(s) {
  return s.trim().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

function seekCodexSequence(lines, pattern, start = 0, eof = false) {
  if (!pattern.length) return start;
  if (pattern.length > lines.length) return undefined;
  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;
  const passes = [
    (a, b) => a === b,
    (a, b) => a.trimEnd() === b.trimEnd(),
    (a, b) => a.trim() === b.trim(),
    (a, b) => normalizeCodexSeek(a) === normalizeCodexSeek(b),
  ];
  for (const eq of passes) {
    for (let i = searchStart; i <= lines.length - pattern.length; i++) {
      let ok = true;
      for (let j = 0; j < pattern.length; j++) if (!eq(lines[i + j], pattern[j])) { ok = false; break; }
      if (ok) return i;
    }
  }
  return undefined;
}

function applyCodexUpdate(text, chunks) {
  const parsed = splitLinesPreserveFinalNewline(text);
  const replacements = [];
  let lineIndex = 0;
  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const idx = seekCodexSequence(parsed.lines, [chunk.changeContext], lineIndex, false);
      if (idx === undefined) throw new Error(`Failed to find context '${chunk.changeContext}'`);
      lineIndex = idx + 1;
    }
    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    if (!pattern.length) {
      replacements.push([parsed.lines.length, 0, newSlice]);
      continue;
    }
    let found = seekCodexSequence(parsed.lines, pattern, lineIndex, chunk.isEndOfFile);
    if (found === undefined && pattern.at(-1) === "") {
      pattern = pattern.slice(0, -1);
      if (newSlice.at(-1) === "") newSlice = newSlice.slice(0, -1);
      found = seekCodexSequence(parsed.lines, pattern, lineIndex, chunk.isEndOfFile);
    }
    if (found === undefined) throw new Error(`Failed to find expected lines:\n${chunk.oldLines.join("\n")}`);
    replacements.push([found, pattern.length, newSlice]);
    lineIndex = found + pattern.length;
  }
  const out = parsed.lines.slice();
  for (const [idx, len, repl] of replacements.sort((a, b) => b[0] - a[0])) out.splice(idx, len, ...repl);
  return joinLines(out, true, parsed.eol);
}

export function validateAndApplyHashlineRangeEdit(text, edit, opts = {}) {
  const { payloadSep = "~" } = opts;
  const op = edit.newText?.length ? "=" : "-";
  const payload = edit.newText?.length ? "\n" + edit.newText.replace(/\r\n/g, "\n").split("\n").map((line) => `${payloadSep}${line}`).join("\n") : "";
  const patch = `@@ ${edit.path ?? "file"}\n${op} ${edit.start}..${edit.end}${payload}`;
  return validateAndApplyHashlinePatch(text, patch, opts);
}

export async function applyCodexPatch(patch, opts = {}) {
  const { cwd = process.cwd(), dryRun = false } = opts;
  const ops = parseCodexPatch(patch);
  const results = [];
  for (const op of ops) {
    const p = resolveUserPath(op.path, cwd);
    if (op.kind === "update") {
      const before = await fs.readFile(p, "utf8");
      const text = applyCodexUpdate(before, op.chunks);
      if (!dryRun) await fs.writeFile(p, text, "utf8");
      results.push({ path: p, kind: "update", chunks: op.chunks.length });
    } else if (op.kind === "add") {
      const text = op.contents.join("\n") + "\n";
      if (!dryRun) await fs.writeFile(p, text, { encoding: "utf8", flag: "wx" });
      results.push({ path: p, kind: "add" });
    } else if (op.kind === "delete") {
      const before = await fs.readFile(p, "utf8");
      if (!dryRun) await fs.unlink(p);
      results.push({ path: p, kind: "delete", oldChars: before.length });
    }
  }
  return { results, ops };
}

export async function appendMetric(metricsPath, record) {
  if (!metricsPath) return;
  await fs.mkdir(path.dirname(metricsPath), { recursive: true });
  await fs.appendFile(metricsPath, `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
}

export function estimateJsonChars(value) {
  return JSON.stringify(value).length;
}

export function estimateTokensFromChars(chars) {
  return Math.ceil(chars / 4);
}
