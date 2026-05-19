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
