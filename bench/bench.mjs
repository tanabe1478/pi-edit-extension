#!/usr/bin/env node
import {
  estimateJsonChars,
  estimateTokensFromChars,
  formatHashline,
  formatHashlineAnchor,
  formatTagged,
  splitLinesPreserveFinalNewline,
  tagFor,
} from "../src/core.mjs";

function makeFixture(lines) {
  const out = [];
  for (let i = 1; i <= lines; i++) {
    if (i % 7 === 0) out.push(`  if (items[${i}].enabled && limit > ${i}) { total += compute(items[${i}], limit); }`);
    else if (i % 5 === 0) out.push(`  const value_${i} = normalize(input.value_${i} ?? defaultValue);`);
    else out.push(`  // filler line ${i} with moderately long context and indentation`);
  }
  return out.join("\n") + "\n";
}

function makeTaggedSpec(text, start, end, tagChars = 4) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const specs = [];
  for (let n = start; n <= end; n++) specs.push(`${n}:${tagFor(lines[n - 1], tagChars)}`);
  return specs.join("\n");
}

function makeHashlinePatch(text, start, end, newText) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const a = formatHashlineAnchor(start, lines[start - 1]);
  const b = formatHashlineAnchor(end, lines[end - 1]);
  const payload = newText.length ? "\n" + newText.split("\n").map((line) => `~${line}`).join("\n") : "";
  return `@@ fixture.ts\n= ${a}..${b}${payload}`;
}

function compareScenario(name, text, start, end, newText) {
  const { lines } = splitLinesPreserveFinalNewline(text);
  const oldText = lines.slice(start - 1, end).join("\n");
  const oldNew = { path: "fixture.ts", edits: [{ oldText, newText }] };
  const piEdit = { path: "fixture.ts", edits: [{ oldText, newText }] };
  const tagged = { path: "fixture.ts", edits: [{ lines: makeTaggedSpec(text, start, end), newText }] };
  const crc = { path: "fixture.ts", fileCrc32: "12345678", startLine: start, endLine: end, newText };
  const hashline = { input: makeHashlinePatch(text, start, end, newText) };
  const oldNewChars = estimateJsonChars(oldNew);
  const piEditChars = estimateJsonChars(piEdit);
  const taggedChars = estimateJsonChars(tagged);
  const crcChars = estimateJsonChars(crc);
  const hashlineChars = estimateJsonChars(hashline);
  return {
    name,
    editedLines: end - start + 1,
    oldNewChars,
    piEditChars,
    taggedChars,
    hashlineChars,
    crcChars,
    piEditSavedPct: Number((((oldNewChars - piEditChars) / oldNewChars) * 100).toFixed(1)),
    taggedSavedPct: Number((((oldNewChars - taggedChars) / oldNewChars) * 100).toFixed(1)),
    hashlineSavedPct: Number((((oldNewChars - hashlineChars) / oldNewChars) * 100).toFixed(1)),
    crcSavedPct: Number((((oldNewChars - crcChars) / oldNewChars) * 100).toFixed(1)),
    oldNewTokensEst: estimateTokensFromChars(oldNewChars),
    piEditTokensEst: estimateTokensFromChars(piEditChars),
    taggedTokensEst: estimateTokensFromChars(taggedChars),
    hashlineTokensEst: estimateTokensFromChars(hashlineChars),
    crcTokensEst: estimateTokensFromChars(crcChars),
  };
}

const fixture = makeFixture(240);
const scenarios = [
  compareScenario("one-line replacement", fixture, 10, 10, "  const value_10 = normalizeFast(input.value_10);") ,
  compareScenario("small block replacement", fixture, 35, 39, "  total += computeWindow(items, 35, 39, limit);"),
  compareScenario("large deletion", fixture, 80, 139, ""),
  compareScenario("large replacement", fixture, 150, 220, "  return summarize(items, limit);"),
];

console.table(scenarios);
const total = scenarios.reduce((acc, x) => {
  acc.oldNewChars += x.oldNewChars;
  acc.piEditChars += x.piEditChars;
  acc.taggedChars += x.taggedChars;
  acc.hashlineChars += x.hashlineChars;
  acc.crcChars += x.crcChars;
  return acc;
}, { oldNewChars: 0, piEditChars: 0, taggedChars: 0, hashlineChars: 0, crcChars: 0 });
console.log("TOTAL", {
  ...total,
  piEditSavedPct: Number((((total.oldNewChars - total.piEditChars) / total.oldNewChars) * 100).toFixed(1)),
  taggedSavedPct: Number((((total.oldNewChars - total.taggedChars) / total.oldNewChars) * 100).toFixed(1)),
  hashlineSavedPct: Number((((total.oldNewChars - total.hashlineChars) / total.oldNewChars) * 100).toFixed(1)),
  crcSavedPct: Number((((total.oldNewChars - total.crcChars) / total.oldNewChars) * 100).toFixed(1)),
});
console.log("\nSample read_tagged output:\n" + formatTagged(fixture, { offset: 35, limit: 5 }).text);
console.log("\nSample read_hashline output:\n" + formatHashline(fixture, { offset: 35, limit: 5 }).text);
