# pi-tagged-edit-extension

Experimental [pi](https://pi.dev) extension for antirez-style checksum-tagged line edits.

## Why

Traditional `oldText -> newText` edit tools are safe because they behave like CAS: the old text must still match before replacement. But they are token-expensive, especially for large deletions or replacements. This extension tests a shorter CAS form:

```text
10:Q8fA int count = 10;
11:rA3_ if (count > limit) {
```

The model can then edit by line number plus a short checksum tag instead of repeating the full old text.

## Tools

### `read_hashline`

Reads a file using an oh-my-pi-style compact anchor format:

```text
42sr|function hi() {
```

The normal anchor is `42sr`: line number plus a 2-letter content hash. This implementation matches oh-my-pi's anchor algorithm: trim trailing whitespace, remove CR, hash with xxHash32 seed 0, then map into the curated 647-entry single-token bigram table.

`read_hashline_legacy` preserves the original compact-only behavior for A/B comparisons. By default `read_hashline` uses deterministic adaptive strict anchors. Safe-looking lines stay compact:

```text
42sr|const value = 1;
```

Risky lines get an additional checksum:

```text
43ab:Q8fA|}
```

Strict anchors are emitted deterministically for low-information lines, repeated lines, and lines whose 2-character hash collides in the file. Destructive or wide range edits require strict range endpoints.

### `read_hashline_legacy` / `edit_hashline_patch_legacy`

These preserve the original compact-only `LINEhh` behavior and skip the adaptive strict range requirement. They are kept for before/after benchmarking and compatibility experiments; prefer `read_hashline` / `edit_hashline_patch` for safer default behavior.

### `search_hashline`

Searches a file or directory and returns matches plus context with the same `LINEhh|TEXT` anchors as `read_hashline`.

Parameters:

- `path`
- `pattern`
- `regex?`
- `context?` default `2`
- `limit?` default `100`

### `edit_hashline_range`

Structured adaptive hashline range edit. This is intended for natural LLM use because it avoids the free-form `= A..B` / `~payload` patch syntax:

```json
{
  "path": "src/a.ts",
  "start": "4fb",
  "end": "5dm:Q8fA",
  "newText": "const clean = normalize(name);\nreturn clean;"
}
```

Copy anchors from `read_hashline`, including `:tag` when present. Empty `newText` deletes the range.

### `edit_hashline_patch`

Applies a compact patch language inspired by oh-my-pi:

```text
@@ src/a.ts
= 4fb..5dm
~const clean = (name || DEF).trim();
~return clean.length === 0 ? DEF : clean.toUpperCase();
```

Ops:

- `+ ANCHOR` insert after
- `< ANCHOR` insert before
- `- A..B` delete range
- `= A..B` replace range
- payload lines start with `~`

### `edit_codex_patch`

Applies a Codex `apply_patch`-style context diff:

```text
*** Begin Patch
*** Update File: src/a.ts
@@
 const before = 1;
-const value = oldName(input);
+const value = newName(input);
 const after = 2;
*** End Patch
```

This implementation is based on the current OpenAI Codex `codex-rs/apply-patch` parser/application behavior: `*** Begin Patch` envelope, file operations, `@@` hunks, old/context lines located by exact match, then trailing-whitespace-insensitive, trim-insensitive, and Unicode-punctuation-normalized matching. It is included as `codex_patch` in benchmarks.

### `read_tagged`

Reads a file and returns lines as:

```text
line:tag content
```

Parameters:

- `path`
- `offset?`
- `limit?`
- `tagChars?` default `4`
- `saltMode?` default `none`; use `line` to hash `lineNumber + lineText`

### `edit_tagged`

Whole-line replacement with tag validation.

Single line:

```json
{
  "path": "example.ts",
  "edits": [
    { "line": 10, "tag": "Q8fA", "newText": "const count = 11;" }
  ]
}
```

Multiple lines:

```json
{
  "path": "example.ts",
  "edits": [
    { "lines": "11:rA3_\n12:Kq9z\n13:PX0b", "newText": "return limit;" }
  ]
}
```

Empty `newText` deletes the selected line range.

### `edit_crc_range`

Experimental whole-file CRC range edit:

```json
{
  "path": "example.ts",
  "fileCrc32": "a1b2c3d4",
  "startLine": 10,
  "endLine": 23,
  "newText": "..."
}
```

This is shorter, but any unrelated file change invalidates the CRC.

## Install for local pi testing

From this repository:

```bash
pi -e ./src/index.ts
```

Or add this repository to pi settings as an extension/package once you are happy with it.

## Metrics

Set `PI_TAGGED_EDIT_METRICS` to a JSONL path. Tool calls append structured records:

```bash
export PI_TAGGED_EDIT_METRICS=/tmp/pi-tagged-edit-metrics.jsonl
pi -e ./src/index.ts
```

Metrics include:

- `tool`
- `editedLines`
- `taggedInputChars`
- `equivalentOldNewChars`
- `savedCharsEstimate`
- rough token estimates using `chars / 4`

## Benchmark

Synthetic benchmark:

```bash
npm run bench
```

Failure/stress benchmark for stale, collision, and fuzzy-match behavior:

```bash
npm run bench:failure
```

Fallback policy stress benchmark:

```bash
npm run bench:fallback
```

Agent-level fallback benchmark:

```bash
npm run bench:fallback-agent
```

Historical notes and current benchmark interpretation are in [`docs/benchmark-history.md`](docs/benchmark-history.md).

Product-level and natural-use eval planning is in [`docs/product-eval-plan.md`](docs/product-eval-plan.md). Remaining validation steps are tracked in [`docs/remaining-work-plan.md`](docs/remaining-work-plan.md). Tool I/O accounting is described in [`docs/tool-io-accounting.md`](docs/tool-io-accounting.md). Natural-use validation results are tracked in [`docs/natural-use-results.md`](docs/natural-use-results.md), with structured range follow-up in [`docs/hashline-range-results.md`](docs/hashline-range-results.md) and the 43-task natural-use run in [`docs/natural-use-43-results.md`](docs/natural-use-43-results.md). Product-level runner notes are in [`docs/product-runner.md`](docs/product-runner.md), with edit replacement modes in [`docs/edit-replacement-modes.md`](docs/edit-replacement-modes.md), edit replacement results in [`docs/edit-replacement-results.md`](docs/edit-replacement-results.md), larger product tasks in [`docs/larger-product-tasks.md`](docs/larger-product-tasks.md), repeated trial notes in [`docs/product-trials.md`](docs/product-trials.md), outcome classification in [`docs/product-outcome-classification.md`](docs/product-outcome-classification.md), lifecycle tasks in [`docs/file-lifecycle-tasks.md`](docs/file-lifecycle-tasks.md), lifecycle results in [`docs/file-lifecycle-results.md`](docs/file-lifecycle-results.md), first results in [`docs/product-runner-results.md`](docs/product-runner-results.md), hybrid policy results in [`docs/hybrid-tool-policy-results.md`](docs/hybrid-tool-policy-results.md), fallback stress results in [`docs/fallback-stress-results.md`](docs/fallback-stress-results.md), and agent fallback results in [`docs/fallback-agent-results.md`](docs/fallback-agent-results.md). An initial natural-use runner is available:

```bash
npm run bench:natural -- --out /tmp/pi-edit-natural --modes pi_edit,tagged,hashline,hashline_range --limit 3
```

It compares JSON payload sizes for:

- standard `oldText/newText`
- tagged line edits, antirez-style `line:tag`
- hashline patch edits, oh-my-pi-style `LINEhh|TEXT`
- whole-file CRC range edits

## Tests

```bash
npm test
```

## Current limitations

- Edits are whole-line only.
- Tags are short CRC32-derived prefixes, so collisions are possible.
- `read_hashline` vendors oh-my-pi's curated 647 single-token bigram list and uses a Node-compatible xxHash32 implementation matching `Bun.hash.xxHash32(input, 0)`.
- The hashline patch parser has read/search snapshot recovery for simple stale-anchor cases, but still lacks oh-my-pi's richer duplicate-boundary absorption, LSP writethrough, and streaming preview.
- A plain `LINEhh` hashline anchor already uses line number + 2-letter hash, so ordinary cross-line hash collisions are line-disambiguated. The remaining risk is same-line stale collision: the same line number changes to different content that happens to have the same 2-letter hash. This is documented by a regression test (`documents 2-char hashline false-accept collision risk`). Adaptive strict anchors mitigate this for deterministic high-risk cases while preserving compact anchors for safe-looking lines.
- This is a prototype for measuring behavior, not a replacement for pi's built-in `edit` yet.

## Experiment plan

Generate a neutral benchmark plan for this extension and oh-my-pi:

```bash
npm run bench:plan -- /tmp/pi-edit-plan.json
```

Generate a full parallel run directory for this extension and upstream oh-my-pi:

```bash
npm run bench:parallel -- --out /tmp/pi-edit-parallel
```

Prepare and smoke-check upstream oh-my-pi as well:

```bash
npm run bench:parallel -- --out /tmp/pi-edit-parallel --install --build-native --smoke
```

Run actual pi harness comparisons for selected modes:

```bash
npm run bench:actual -- --out /tmp/pi-edit-actual --modes pi_edit,tagged,hashline,crc
```

`oh_my_pi` can be included once `/Users/tanabe.nobuyuki/.omp/agent` has a model configured or API keys are exported:

```bash
npm run bench:actual -- --out /tmp/pi-edit-actual-omp --modes oh_my_pi --include-oh-my-pi
```

Generate a report from a run directory:

```bash
npm run bench:report -- --dir /tmp/pi-edit-parallel --out /tmp/pi-edit-parallel/report.md
```

See `bench/oh-my-pi.md` for the parallel upstream run notes.

Run the same task suite under five modes:

1. `oldText/newText` generic baseline
2. pi built-in `edit` tool (`path`, `edits[].oldText`, `edits[].newText`)
3. `read_tagged` + `edit_tagged`
4. `read_hashline` + `edit_hashline_patch`
5. `read_tagged` details.fileCrc32 + `edit_crc_range`

`old_new` and `pi_edit` currently have the same payload shape, but are kept separate so real harness runs can distinguish generic exact replacement from pi's actual built-in tool behavior, rendering, retries, and diagnostics.

Primary metrics:

- model output chars/tokens spent on edit calls
- edit success rate
- stale-anchor rejection/recovery rate
- retry count per task
- task success rate

Secondary metrics:

- read output overhead
- wall time
- collision/mismatch diagnostics quality
- whether the model chooses minimal operations (`+`/`-`) instead of broad `=` ranges
