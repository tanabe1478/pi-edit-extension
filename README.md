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
- tagged line edits
- whole-file CRC range edits

## Tests

```bash
npm test
```

## Current limitations

- Edits are whole-line only.
- Tags are short CRC32-derived base64url prefixes, so collisions are possible.
- 4-char tags are intentionally compact; compare with 6/8 chars before production use.
- This is a prototype for measuring behavior, not a replacement for pi's built-in `edit` yet.
