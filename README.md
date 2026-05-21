# pi-edit-extension

Japanese: [README.ja.md](README.ja.md)

An experimental pi extension for opt-in replacement of the built-in `edit` tool.

The project is inspired by antirez-style checksum tags, oh-my-pi hashline anchors, and Codex-style patches. The implementation and policy are independent.

## What it does

- Uses `read_tagged` + `edit_tagged` for normal edits.
- Uses `read_hashline` + `edit_hashline_range` for safety-sensitive edits.
- Falls back to tagged edits after hashline rejection.
- Keeps built-in `read`, `write`, and `bash` available.
- Provides benchmarks and session-log reporting.

## Recommended usage

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range
```

Do not include built-in `edit` when evaluating replacement behavior.

## Recommended policy

| Situation | Tool path |
| --- | --- |
| Normal existing-file edit | `read_tagged` + `edit_tagged` |
| Stale-sensitive or repeated-file edit | `read_hashline` + `edit_hashline_range` |
| Hashline rejection | `read_tagged` + `edit_tagged` |
| Create file | `write` |
| Delete / rename / test | `bash` |

See [Recommended edit policy](docs/recommended-edit-policy.md).

## Tools

### `read_tagged`

Reads lines with validation tags.

```text
10:Q8fA const count = 10;
```

### `edit_tagged`

Applies whole-line edits using line numbers and tags.

```json
{
  "path": "example.ts",
  "edits": [
    { "line": 10, "tag": "Q8fA", "newText": "const count = 11;" }
  ]
}
```

Multi-line edits are supported.

```json
{
  "path": "example.ts",
  "edits": [
    { "lines": "11:rA3_\n12:Kq9z", "newText": "return value;" }
  ]
}
```

### `read_hashline`

Reads lines with hashline anchors.

```text
42sr|const value = 1;
43ab:Q8fA|}
```

Safe lines use `LINEhh`. Risky lines use `LINEhh:tag`.

### `edit_hashline_range`

Applies structured range edits using hashline anchors.

```json
{
  "path": "src/a.ts",
  "start": "4fb",
  "end": "5dm:Q8fA",
  "newText": "const clean = normalize(name);\nreturn clean;"
}
```

Use an empty `newText` to delete the range.

### `search_hashline`

Searches with hashline anchors in the result.

### `edit_hashline_patch`

Applies an oh-my-pi-style compact patch. Prefer `edit_hashline_range` for natural LLM use.

### `edit_codex_patch`

Applies a Codex `apply_patch`-style patch. Useful for add/delete/update file operations.

### Legacy and experimental tools

- `read_hashline_legacy`
- `edit_hashline_patch_legacy`
- `edit_crc_range`
- `edit_hashline_range_reject_once` benchmark-only

## Metrics

```bash
export PI_TAGGED_EDIT_METRICS=/tmp/pi-edit-metrics.jsonl
pi -e ./src/index.ts
```

Metrics include:

- tool name
- edited lines
- input chars
- result chars
- saved chars estimate
- rough token estimate

## Benchmarks

```bash
npm test
npm run bench
npm run bench:failure
npm run bench:product
```

Run the recommended policy:

```bash
npm run bench:product -- \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

Compare with built-in `edit`:

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

Summarize runs:

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-summary.md \
  /tmp/some-product-run
```

## Session report skill

Generate an improvement report from pi session JSONL logs.

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session <session-file-or-directory> \
  --repo .
```

## Documentation

- [Documentation index](docs/README.md)
- [Quickstart](docs/quickstart.md)
- [Recommended edit policy](docs/recommended-edit-policy.md)
- [Final evaluation report](docs/final-evaluation-report.md)
- [Archive](docs/archive/)

## Current status

The extension is ready for opt-in trials.

It is not proven to be cheaper than built-in `edit` in every case. Use it as a policy-based replacement that trades between natural editing, stale-safety, and fallback behavior.

Recommended stance:

- Use it as an opt-in extension.
- Use tagged edits by default.
- Use hashline edits for safety-sensitive cases.
- Capture session I/O for final comparisons.

## Limitations

- Mostly whole-line edits.
- Short tags and hashes can collide.
- Adaptive strict hashline mitigates known high-risk cases.
- Long-running real-repository usage is still limited.

## License

MIT
