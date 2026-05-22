# pi-edit-extension

English: [README](README.md)

pi の built-in `edit` を opt-in で置き換えるための実験的 extension です。

antirez-style checksum tags、oh-my-pi hashline anchors、Codex-style patches を参考にしています。実装と policy は独自です。

## できること

- 通常編集に `read_tagged` + `edit_tagged` を使う
- safety-sensitive な編集に `read_hashline` + `edit_hashline_range` を使う
- hashline が reject されたら tagged edit に fallback する
- built-in `read`, `write`, `bash` は残す
- benchmark と session log report を提供する

## 推奨起動

```bash
./bin/pi-edit
```

明示的に書く場合は以下と同じです。

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range,search_hashline
```

replacement behavior を評価するときは built-in `edit` を含めません。

## 推奨 policy

| 場面 | Tool path |
| --- | --- |
| 通常の既存ファイル編集 | `read_tagged` + `edit_tagged` |
| stale-sensitive / repeated file edit | `read_hashline` + `edit_hashline_range` |
| hashline rejection | `read_tagged` + `edit_tagged` |
| create file | `write` |
| delete / rename / test | `bash` |

詳細は [推奨 edit policy](docs/ja/recommended-edit-policy.md) を参照してください。

## Tools

### `read_tagged`

validation tag 付きで行を読みます。

```text
10:Q8fA const count = 10;
```

### `edit_tagged`

line number と tag を使って whole-line edit を行います。

```json
{
  "path": "example.ts",
  "edits": [
    { "line": 10, "tag": "Q8fA", "newText": "const count = 11;" }
  ]
}
```

複数行 edit も対応しています。

```json
{
  "path": "example.ts",
  "edits": [
    { "lines": "11:rA3_\n12:Kq9z", "newText": "return value;" }
  ]
}
```

### `read_hashline`

hashline anchor 付きで行を読みます。

```text
42sr|const value = 1;
43ab:Q8fA|}
```

安全な行は `LINEhh`、リスクがある行は `LINEhh:tag` になります。

### `edit_hashline_range`

hashline anchor を使って structured range edit を行います。

```json
{
  "path": "src/a.ts",
  "start": "4fb",
  "end": "5dm:Q8fA",
  "newText": "const clean = normalize(name);\nreturn clean;"
}
```

`newText` を空文字にすると range を削除します。

### `search_hashline`

検索結果に hashline anchors を付けて返します。

### `edit_hashline_patch`

oh-my-pi-style compact patch を適用します。自然な LLM 利用では `edit_hashline_range` を推奨します。

### `edit_codex_patch`

Codex `apply_patch` style patch を適用します。add/delete/update file operations に向いています。

### Legacy / experimental tools

- `read_hashline_legacy`
- `edit_hashline_patch_legacy`
- `edit_crc_range`
- `edit_hashline_range_reject_once` benchmark-only

## Metrics

```bash
export PI_TAGGED_EDIT_METRICS=/tmp/pi-edit-metrics.jsonl
pi -e ./src/index.ts
```

記録される主な内容:

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

推奨 policy を実行します。

```bash
npm run bench:product -- \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

built-in `edit` と比較します。

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

run を集計します。

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-summary.md \
  /tmp/some-product-run
```

## Session report skill

pi session JSONL logs から improvement report を生成します。

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session <session-file-or-directory> \
  --repo .
```

## Documentation

- [ドキュメント索引](docs/ja/README.md)
- [Quickstart](docs/ja/quickstart.md)
- [推奨 edit policy](docs/ja/recommended-edit-policy.md)
- [最終評価レポート](docs/ja/final-evaluation-report.md)
- [Archive](docs/ja/archive/)

## Current status

この extension は opt-in trial に使える段階です。

ただし、すべての case で built-in `edit` より低コストだとは証明されていません。自然な編集、stale-safety、fallback behavior の trade-off を扱う policy-based replacement として使います。

推奨スタンス:

- opt-in extension として使う
- tagged edit を default にする
- safety-sensitive case では hashline edit を使う
- 最終比較では session I/O を capture する

## Limitations

- 主に whole-line edit です
- short tags / hashes は collision し得ます
- adaptive strict hashline が既知の high-risk case を緩和します
- real repository での長期利用データはまだ限定的です

## License

MIT
