import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs/promises";
import {
  appendMetric,
  crc32,
  estimateJsonChars,
  estimateTokensFromChars,
  formatTagged,
  resolveUserPath,
  splitLinesPreserveFinalNewline,
  tagFor,
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
