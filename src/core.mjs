import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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

export function tagFor(line, chars = 4, salt = "") {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32BE(crc32(`${salt}${line}`), 0);
  return buf.toString("base64url").slice(0, chars);
}

const HASHLINE_BIGRAMS = Array.from({ length: 26 * 26 }, (_, i) =>
  String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
);

export function hashlineHash(line) {
  // oh-my-pi uses a curated 647-entry single-token bigram table and xxHash32.
  // This prototype keeps the same shape (2 lowercase letters) with CRC32 over
  // content trimmed like oh-my-pi. Good enough for tool-behavior and payload-size
  // experiments; replace with the curated table before claiming tokenizer parity.
  const normalized = line.replace(/\r/g, "").trimEnd();
  return HASHLINE_BIGRAMS[crc32(normalized) % HASHLINE_BIGRAMS.length];
}

export function formatHashlineAnchor(lineNumber, line) {
  return `${lineNumber}${hashlineHash(line)}`;
}

export function formatHashlineLine(lineNumber, line) {
  return `${formatHashlineAnchor(lineNumber, line)}|${line}`;
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
  const { offset = 1, limit } = opts;
  const { lines } = splitLinesPreserveFinalNewline(text);
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, limit ? start + limit - 1 : lines.length);
  const out = [];
  for (let n = start; n <= end; n++) out.push(formatHashlineLine(n, lines[n - 1] ?? ""));
  return { text: out.join("\n"), start, end, totalLines: lines.length };
}

export function parseHashlineAnchor(anchor) {
  const trimmed = String(anchor).trim();
  if (trimmed === "BOF" || trimmed === "EOF") return { special: trimmed };
  const m = /^(\d+)([a-z]{2})$/.exec(trimmed);
  if (!m) throw new Error(`Invalid hashline anchor: ${anchor}`);
  return { line: Number(m[1]), hash: m[2] };
}

function validateHashlineAnchor(anchor, lines) {
  const parsed = parseHashlineAnchor(anchor);
  if (parsed.special) return parsed;
  const actual = lines[parsed.line - 1];
  if (actual === undefined) throw new Error(`Line ${parsed.line} is outside file`);
  const actualHash = hashlineHash(actual);
  if (actualHash !== parsed.hash) throw new Error(`Anchor mismatch at line ${parsed.line}: expected ${parsed.hash}, actual ${actualHash}`);
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
  for (let i = 0; i < patchLines.length; ) {
    const raw = patchLines[i].trimEnd();
    i++;
    if (!raw.trim() || raw.startsWith("@@") || raw === "*** Begin Patch" || raw === "*** End Patch") continue;
    const op = raw[0];
    const rest = raw.slice(1).trim();
    if (op === "+" || op === "<") {
      const anchor = validateHashlineAnchor(rest, parsed.lines);
      const payload = parsePayload(patchLines, i, payloadSep);
      i = payload.next;
      ops.push({ kind: op === "+" ? "after" : "before", anchor, payload: payload.payload });
      continue;
    }
    if (op === "-" || op === "=") {
      const m = /^(.+)\.\.(.+)$/.exec(rest);
      if (!m) throw new Error(`Expected range A..B in op: ${raw}`);
      const a = validateHashlineAnchor(m[1], parsed.lines);
      const b = validateHashlineAnchor(m[2], parsed.lines);
      if (a.special || b.special) throw new Error(`Range anchors must be concrete lines: ${raw}`);
      if (a.line > b.line) throw new Error(`Range start must be <= end: ${raw}`);
      const payload = op === "=" ? parsePayload(patchLines, i, payloadSep) : { payload: [], next: i };
      i = payload.next;
      ops.push({ kind: op === "-" ? "delete" : "replace", start: a.line, end: b.line, payload: payload.payload });
      continue;
    }
    throw new Error(`Unknown hashline op: ${raw}`);
  }

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
