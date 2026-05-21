# Quickstart

Japanese docs: [Japanese documentation](ja/quickstart.md)

## Recommended tool policy

Use this extension with the recommended edit replacement tool set:

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range
```

Do not include built-in `edit` when evaluating replacement behavior.

## Recommended model-facing instruction

```text
Do not use built-in edit.
For normal existing-file content edits, use read_tagged + edit_tagged.
Use read_hashline + edit_hashline_range when stale safety is important, the file is large/repeated, or exact anchors matter.
If a hashline edit is rejected, recover with read_tagged + edit_tagged.
Use write/bash for file creation, deletion, rename, and tests.
When likely target files are known, start with those files and avoid broad repository reads unless necessary.
```

## Typical flows

### Normal edit

1. `read_tagged` target file
2. `edit_tagged` selected lines
3. run tests with `bash` if needed

### Safety-sensitive edit

1. `read_hashline` target file
2. `edit_hashline_range` selected range
3. if rejected, `read_tagged` and `edit_tagged` fallback

### File lifecycle

- create file: built-in `write`
- delete/rename/move: `bash`
- tests: `bash`

## Benchmark the recommended policy

```bash
npm run bench:product -- \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

## Compare with built-in edit

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

## Summarize runs

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-summary.md \
  /tmp/some-product-run
```

## Current guidance

- `read_tagged` + `edit_tagged` is the practical default for natural product edits.
- `read_hashline` + `edit_hashline_range` is the safety-oriented path.
- Relevant-file hints dramatically reduce unnecessary reads.
- Session-level I/O (`--capture-session`) should be used for final comparisons against built-in `edit`.
