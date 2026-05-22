# Quickstart

English: [Quickstart](../quickstart.md)

この extension は pi の built-in `edit` を opt-in で置き換えます。`read`, `write`, `bash` は残します。

## 推奨 tool policy

```bash
./bin/pi-edit
```

明示的に書く場合は以下と同じです。

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range,search_hashline
```

replacement behavior を評価するときは built-in `edit` を入れません。

## モデル向け指示

```text
Do not use built-in edit.
For normal existing-file content edits, use read_tagged + edit_tagged.
Use read_hashline + edit_hashline_range when stale safety is important, the file is large/repeated, or exact anchors matter.
If a hashline edit is rejected, recover with read_tagged + edit_tagged.
Use write/bash for file creation, deletion, rename, and tests.
When likely target files are known, start with those files and avoid broad repository reads unless necessary.
```

## 典型的な流れ

### 通常編集

1. `read_tagged` で対象ファイルを読む
2. `edit_tagged` で対象行を編集する
3. 必要なら `bash` でテストを実行する

### safety-sensitive edit

1. `read_hashline` で対象ファイルを読む
2. `edit_hashline_range` で range edit する
3. reject されたら `read_tagged` + `edit_tagged` に fallback する

### file lifecycle

- create file: `write`
- delete / rename / move: `bash`
- tests: `bash`

## benchmark

```bash
npm run bench:product -- \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

## built-in edit との比較

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

## run の集計

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-summary.md \
  /tmp/some-product-run
```

## 現在の指針

- 通常の product edit は `read_tagged` + `edit_tagged` を default にする
- safety-oriented path は `read_hashline` + `edit_hashline_range`
- target file hint は重要
- built-in `edit` との最終比較は `--capture-session` を使う
