#!/usr/bin/env node
import { buildPlan } from "./plan.mjs";
import { formatHashline, formatTagged } from "../src/core.mjs";

const plan = buildPlan();
const scenarios = plan.scenarios.map((s) => ({
  name: s.name,
  editedLines: s.edited_lines,
  oldNewChars: s.metrics.old_new.chars,
  piEditChars: s.metrics.pi_edit.chars,
  taggedChars: s.metrics.tagged.chars,
  hashlineChars: s.metrics.hashline.chars,
  crcChars: s.metrics.crc.chars,
  piEditSavedPct: Number((((s.metrics.old_new.chars - s.metrics.pi_edit.chars) / s.metrics.old_new.chars) * 100).toFixed(1)),
  taggedSavedPct: Number((((s.metrics.old_new.chars - s.metrics.tagged.chars) / s.metrics.old_new.chars) * 100).toFixed(1)),
  hashlineSavedPct: Number((((s.metrics.old_new.chars - s.metrics.hashline.chars) / s.metrics.old_new.chars) * 100).toFixed(1)),
  crcSavedPct: Number((((s.metrics.old_new.chars - s.metrics.crc.chars) / s.metrics.old_new.chars) * 100).toFixed(1)),
  oldNewTokensEst: s.metrics.old_new.tokens_est,
  piEditTokensEst: s.metrics.pi_edit.tokens_est,
  taggedTokensEst: s.metrics.tagged.tokens_est,
  hashlineTokensEst: s.metrics.hashline.tokens_est,
  crcTokensEst: s.metrics.crc.tokens_est,
}));

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
console.log("\nSample read_tagged output:\n" + formatTagged(plan.fixture.text, { offset: 35, limit: 5 }).text);
console.log("\nSample read_hashline output:\n" + formatHashline(plan.fixture.text, { offset: 35, limit: 5 }).text);
