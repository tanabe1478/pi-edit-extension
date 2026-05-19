import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs/promises";
import {
  appendMetric,
  crc32,
  estimateJsonChars,
  estimateTokensFromChars,
  formatHashline,
  formatHashlineLine,
  formatTagged,
  resolveUserPath,
  splitLinesPreserveFinalNewline,
  tagFor,
  validateAndApplyHashlinePatch,
  validateAndApplyTaggedEdits,
} from "./core.mjs";

const METRICS_ENV = "PI_TAGGED_EDIT_METRICS";

type SaltMode = "none" | "line";

export default function taggedEditExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "read_tagged",
    label: "Read tagged",
    description:
      "Read a text file with each line prefixed as line:tag content. Use the returned tags with edit_tagged for checksum-validated line edits.",
    parameters: Type.Object({
      path: Type.String({ description: "File path, relative to current working directory or absolute" }),
      offset: Type.Optional(Type.Number({ description: "1-indexed start line", minimum: 1 })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines", minimum: 1 })),
      tagChars: Type.Optional(Type.Number({ description: "Checksum tag length; default 4", minimum: 4, maximum: 8 })),
      saltMode: Type.Optional(
        Type.Union([Type.Literal("none"), Type.Literal("line")], {
          description: "Tag salt strategy. 'line' hashes lineNumber + lineText; default 'none'.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const p = resolveUserPath(params.path);
      const tagChars = params.tagChars ?? 4;
      const saltMode = (params.saltMode ?? "none") as SaltMode;
      const fileText = await fs.readFile(p, "utf8");
      const result = formatTagged(fileText, { offset: params.offset, limit: params.limit, tagChars, saltMode });
      await appendMetric(process.env[METRICS_ENV], {
        tool: "read_tagged",
        path: p,
        tagChars,
        saltMode,
        linesReturned: result.end >= result.start ? result.end - result.start + 1 : 0,
        resultChars: result.text.length,
        resultTokenEstimate: estimateTokensFromChars(result.text.length),
      });
      return {
        content: [{ type: "text", text: result.text }],
        details: {
          path: p,
          start: result.start,
          end: result.end,
          totalLines: result.totalLines,
          tagChars,
          saltMode,
          fileCrc32: crc32(fileText).toString(16).padStart(8, "0"),
        },
      };
    },
  });

  pi.registerTool({
    name: "read_hashline",
    label: "Read hashline",
    description:
      "Read a text file using oh-my-pi-style compact hashline anchors: LINEhh|content. Use anchors with edit_hashline_patch.",
    parameters: Type.Object({
      path: Type.String({ description: "File path, relative to current working directory or absolute" }),
      offset: Type.Optional(Type.Number({ description: "1-indexed start line", minimum: 1 })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines", minimum: 1 })),
    }),
    async execute(_toolCallId, params) {
      const p = resolveUserPath(params.path);
      const fileText = await fs.readFile(p, "utf8");
      const result = formatHashline(fileText, { offset: params.offset, limit: params.limit });
      await appendMetric(process.env[METRICS_ENV], {
        tool: "read_hashline",
        path: p,
        linesReturned: result.end >= result.start ? result.end - result.start + 1 : 0,
        resultChars: result.text.length,
        resultTokenEstimate: estimateTokensFromChars(result.text.length),
      });
      return {
        content: [{ type: "text", text: result.text }],
        details: {
          path: p,
          start: result.start,
          end: result.end,
          totalLines: result.totalLines,
          hashShape: "LINEhh|TEXT",
          fileCrc32: crc32(fileText).toString(16).padStart(8, "0"),
        },
      };
    },
  });

  pi.registerTool({
    name: "search_hashline",
    label: "Search hashline",
    description:
      "Search text files and return matching lines plus context using read_hashline-compatible LINEhh|content anchors.",
    parameters: Type.Object({
      path: Type.String({ description: "File or directory path to search" }),
      pattern: Type.String({ description: "Literal string or regex pattern" }),
      regex: Type.Optional(Type.Boolean({ description: "Treat pattern as JavaScript regex; default false" })),
      context: Type.Optional(Type.Number({ description: "Context lines around each match; default 2", minimum: 0, maximum: 10 })),
      limit: Type.Optional(Type.Number({ description: "Maximum matching lines; default 100", minimum: 1 })),
    }),
    async execute(_toolCallId, params) {
      const root = resolveUserPath(params.path);
      const context = params.context ?? 2;
      const limit = params.limit ?? 100;
      const matcher = params.regex
        ? new RegExp(params.pattern)
        : { test: (line: string) => line.includes(params.pattern) };
      const files: string[] = [];
      async function walk(p: string) {
        const st = await fs.stat(p);
        if (st.isFile()) { files.push(p); return; }
        if (!st.isDirectory()) return;
        for (const ent of await fs.readdir(p, { withFileTypes: true })) {
          if (ent.name === ".git" || ent.name === "node_modules" || ent.name === "dist" || ent.name === "build") continue;
          const child = `${p}/${ent.name}`;
          if (ent.isDirectory()) await walk(child);
          else if (ent.isFile()) files.push(child);
        }
      }
      await walk(root);
      const out: string[] = [];
      let matches = 0;
      for (const file of files.sort()) {
        let text: string;
        try { text = await fs.readFile(file, "utf8"); } catch { continue; }
        if (text.includes("\0")) continue;
        const fileLines = splitLinesPreserveFinalNewline(text).lines;
        const selected = new Set<number>();
        for (let i = 0; i < fileLines.length; i++) {
          if (!matcher.test(fileLines[i])) continue;
          matches++;
          for (let n = Math.max(1, i + 1 - context); n <= Math.min(fileLines.length, i + 1 + context); n++) selected.add(n);
          if (matches >= limit) break;
        }
        if (!selected.size) continue;
        out.push(`@@ ${file}`);
        let prev = 0;
        for (const n of [...selected].sort((a, b) => a - b)) {
          if (prev && n > prev + 1) out.push("...");
          out.push(formatHashlineLine(n, fileLines[n - 1] ?? ""));
          prev = n;
        }
        if (matches >= limit) break;
      }
      const text = out.join("\n");
      await appendMetric(process.env[METRICS_ENV], {
        tool: "search_hashline",
        path: root,
        matches,
        resultChars: text.length,
        resultTokenEstimate: estimateTokensFromChars(text.length),
      });
      return { content: [{ type: "text", text: text || "No matches" }], details: { path: root, matches, files: files.length } };
    },
  });

  pi.registerTool({
    name: "edit_tagged",
    label: "Edit tagged",
    description:
      "Replace whole lines after validating line checksum tags from read_tagged. This is a CAS-style edit that is often shorter than oldText/newText for large edits or deletions.",
    parameters: Type.Object({
      path: Type.String({ description: "File path, relative to current working directory or absolute" }),
      edits: Type.Array(
        Type.Object({
          line: Type.Optional(Type.Number({ description: "Single 1-indexed line to replace", minimum: 1 })),
          tag: Type.Optional(Type.String({ description: "Checksum tag for single-line edit" })),
          lines: Type.Optional(Type.String({ description: "Multi-line spec, one per line: line:tag" })),
          newText: Type.String({ description: "Replacement text. May contain multiple lines. Empty string deletes the selected line(s)." }),
        }),
        { minItems: 1 },
      ),
      tagChars: Type.Optional(Type.Number({ description: "Checksum tag length; default 4", minimum: 4, maximum: 8 })),
      saltMode: Type.Optional(Type.Union([Type.Literal("none"), Type.Literal("line")])),
    }),
    async execute(_toolCallId, params) {
      const p = resolveUserPath(params.path);
      const tagChars = params.tagChars ?? 4;
      const saltMode = (params.saltMode ?? "none") as SaltMode;
      const before = await fs.readFile(p, "utf8");
      const beforeLines = splitLinesPreserveFinalNewline(before).lines;
      const result = validateAndApplyTaggedEdits(before, params.edits, { tagChars, saltMode });
      await fs.writeFile(p, result.text, "utf8");

      let oldTextChars = 0;
      for (const r of result.ranges) oldTextChars += beforeLines.slice(r.start - 1, r.end).join("\n").length;
      const taggedInputChars = estimateJsonChars(params);
      const equivalentOldNewChars = estimateJsonChars({ path: params.path, edits: result.ranges.map((r) => ({ oldText: beforeLines.slice(r.start - 1, r.end).join("\n"), newText: r.newText })) });
      await appendMetric(process.env[METRICS_ENV], {
        tool: "edit_tagged",
        path: p,
        tagChars,
        saltMode,
        edits: result.ranges.length,
        editedLines: result.ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0),
        oldTextChars,
        taggedInputChars,
        equivalentOldNewChars,
        savedCharsEstimate: equivalentOldNewChars - taggedInputChars,
        taggedTokenEstimate: estimateTokensFromChars(taggedInputChars),
        equivalentOldNewTokenEstimate: estimateTokensFromChars(equivalentOldNewChars),
      });

      return {
        content: [{ type: "text", text: `Applied ${result.ranges.length} tagged edit(s) to ${p}` }],
        details: { path: p, edits: result.ranges.length, tagChars, saltMode },
      };
    },
  });

  pi.registerTool({
    name: "edit_hashline_patch",
    label: "Edit hashline patch",
    description:
      "Apply a compact oh-my-pi-style hashline patch. Anchors are copied from read_hashline as LINEhh. Ops: + ANCHOR, < ANCHOR, - A..B, = A..B; payload lines start with ~.",
    parameters: Type.Object({
      input: Type.String({ description: "Patch text. Sections start with @@ PATH. Payload lines start with ~ by default." }),
      payloadSep: Type.Optional(Type.String({ description: "Payload line separator; default ~" })),
    }),
    async execute(_toolCallId, params) {
      const sections = String(params.input)
        .split(/\n(?=@@\s+)/)
        .map((s) => s.trimEnd())
        .filter(Boolean);
      const results = [];
      for (const section of sections) {
        const lines = section.split(/\n/);
        const header = lines.find((l) => l.trim().startsWith("@@"));
        if (!header) throw new Error("Hashline patch section must start with @@ PATH");
        const target = header.replace(/^@@\s*/, "").trim();
        const p = resolveUserPath(target);
        const before = await fs.readFile(p, "utf8");
        const result = validateAndApplyHashlinePatch(before, section, { payloadSep: params.payloadSep ?? "~" });
        await fs.writeFile(p, result.text, "utf8");
        results.push({ path: p, ops: result.ops.length });
      }
      await appendMetric(process.env[METRICS_ENV], {
        tool: "edit_hashline_patch",
        sections: results.length,
        ops: results.reduce((sum, r) => sum + r.ops, 0),
        inputChars: estimateJsonChars(params),
        inputTokenEstimate: estimateTokensFromChars(estimateJsonChars(params)),
      });
      return {
        content: [{ type: "text", text: `Applied hashline patch to ${results.map((r) => r.path).join(", ")}` }],
        details: { results },
      };
    },
  });

  pi.registerTool({
    name: "edit_crc_range",
    label: "Edit CRC range",
    description:
      "Experimental whole-file CRC range edit. Shorter than line tags, but any unrelated file change invalidates the edit.",
    parameters: Type.Object({
      path: Type.String(),
      fileCrc32: Type.String({ description: "8 hex chars from read_tagged details.fileCrc32" }),
      startLine: Type.Number({ minimum: 1 }),
      endLine: Type.Number({ minimum: 1 }),
      newText: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const p = resolveUserPath(params.path);
      const before = await fs.readFile(p, "utf8");
      const actual = crc32(before).toString(16).padStart(8, "0");
      if (actual !== params.fileCrc32.toLowerCase()) {
        throw new Error(`fileCrc32 mismatch: expected ${params.fileCrc32}, actual ${actual}`);
      }
      const lineTags = [];
      const parsed = splitLinesPreserveFinalNewline(before);
      for (let line = params.startLine; line <= params.endLine; line++) {
        lineTags.push({ line, tag: tagFor(parsed.lines[line - 1] ?? "") });
      }
      const result = validateAndApplyTaggedEdits(before, [{ lines: lineTags.map((x) => `${x.line}:${x.tag}`).join("\n"), newText: params.newText }]);
      await fs.writeFile(p, result.text, "utf8");
      await appendMetric(process.env[METRICS_ENV], {
        tool: "edit_crc_range",
        path: p,
        editedLines: params.endLine - params.startLine + 1,
        inputChars: estimateJsonChars(params),
      });
      return { content: [{ type: "text", text: `Applied CRC range edit to ${p}` }], details: { path: p } };
    },
  });
}
