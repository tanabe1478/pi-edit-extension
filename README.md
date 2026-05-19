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

The anchor is `42sr`: line number plus a 2-letter content hash. This implementation matches oh-my-pi's anchor algorithm: trim trailing whitespace, remove CR, hash with xxHash32 seed 0, then map into the curated 647-entry single-token bigram table.

### `search_hashline`

Searches a file or directory and returns matches plus context with the same `LINEhh|TEXT` anchors as `read_hashline`.

Parameters:

- `path`
- `pattern`
- `regex?`
- `context?` default `2`
- `limit?` default `100`

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

See `bench/oh-my-pi.md` for the parallel upstream run notes.

Run the same task suite under four modes:

1. `oldText/newText` baseline
2. `read_tagged` + `edit_tagged`
3. `read_hashline` + `edit_hashline_patch`
4. `read_tagged` details.fileCrc32 + `edit_crc_range`

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
