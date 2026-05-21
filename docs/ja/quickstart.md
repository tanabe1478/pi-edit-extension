# Quickstart 日本語版

English: [Quickstart](../quickstart.md)

## 起動例

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range
```

built-in `edit` は入れません。

## モデルへの指示例

```text
Do not use built-in edit.
Use read_tagged + edit_tagged for normal edits.
Use read_hashline + edit_hashline_range for safety-sensitive or large repeated file edits.
If hashline is rejected, fall back to tagged.
Use write/bash for file lifecycle and tests.
Start with likely relevant files and avoid broad reads.
```

## 使い分け

| 場面 | tool |
| --- | --- |
| 通常編集 | `read_tagged` + `edit_tagged` |
| safety / repeated file | `read_hashline` + `edit_hashline_range` |
| hashline reject | `read_tagged` + `edit_tagged` |
| create file | `write` |
| delete / rename / test | `bash` |

## benchmark

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```
