# pi-edit-extension

pi の built-in `edit` を opt-in で置き換える実験的 extension です。

antirez-style checksum tags、oh-my-pi hashline anchors、Codex-style patch を参考にしています。実装は独自です。

## できること

- 通常編集を `read_tagged` + `edit_tagged` で行う
- 安全性が必要な編集を `read_hashline` + `edit_hashline_range` で行う
- hashline が拒否されたら tagged に fallback する
- `write` / `bash` はそのまま使う
- benchmark と session log から改善点を確認する

## 推奨起動

```bash
pi \
  -e ./src/index.ts \
  --tools read,write,bash,read_tagged,edit_tagged,read_hashline,edit_hashline_range
```

built-in `edit` は入れません。

## 推奨ポリシー

| 場面 | tool |
| --- | --- |
| 通常の既存ファイル編集 | `read_tagged` + `edit_tagged` |
| stale safety / repeated file | `read_hashline` + `edit_hashline_range` |
| hashline reject | `read_tagged` + `edit_tagged` |
| create file | `write` |
| delete / rename / test | `bash` |

詳しくは [`docs/recommended-edit-policy.md`](docs/recommended-edit-policy.md) を参照してください。

## Tools

### `read_tagged`

行ごとに tag を付けて読みます。

```text
10:Q8fA const count = 10;
```

### `edit_tagged`

tag と行番号で whole-line edit を行います。

```json
{
  "path": "example.ts",
  "edits": [
    { "line": 10, "tag": "Q8fA", "newText": "const count = 11;" }
  ]
}
```

複数行も指定できます。

```json
{
  "path": "example.ts",
  "edits": [
    { "lines": "11:rA3_\n12:Kq9z", "newText": "return value;" }
  ]
}
```

### `read_hashline`

hashline anchor 付きで読みます。

```text
42sr|const value = 1;
43ab:Q8fA|}
```

通常は `LINEhh`、危険な行は `LINEhh:tag` になります。

### `edit_hashline_range`

hashline anchor で range edit を行います。

```json
{
  "path": "src/a.ts",
  "start": "4fb",
  "end": "5dm:Q8fA",
  "newText": "const clean = normalize(name);\nreturn clean;"
}
```

空文字を指定すると削除です。

### `search_hashline`

hashline anchor 付きで検索します。

### `edit_hashline_patch`

oh-my-pi-style の compact patch を適用します。自然利用では `edit_hashline_range` を推奨します。

### `edit_codex_patch`

Codex `apply_patch` 風 patch を適用します。add/delete/update file を扱いやすいです。

### legacy / experimental

- `read_hashline_legacy`
- `edit_hashline_patch_legacy`
- `edit_crc_range`
- `edit_hashline_range_reject_once`（benchmark 専用）

## Metrics

```bash
export PI_TAGGED_EDIT_METRICS=/tmp/pi-edit-metrics.jsonl
pi -e ./src/index.ts
```

主な記録内容:

- tool name
- edited lines
- input chars
- result chars
- saved chars estimate
- rough token estimate

## Benchmark

```bash
npm test
npm run bench
npm run bench:failure
npm run bench:product
```

推奨 policy を試す例:

```bash
npm run bench:product -- \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

built-in `edit` と比較する例:

```bash
npm run bench:product -- \
  --modes pi_edit,replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

集計:

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-summary.md \
  /tmp/some-product-run
```

## Session report skill

pi session JSONL から改善レポートを生成できます。

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session <session-file-or-directory> \
  --repo .
```

## Documentation

- [`docs/README.md`](docs/README.md) - docs index
- [`docs/quickstart.md`](docs/quickstart.md) - quickstart
- [`docs/recommended-edit-policy.md`](docs/recommended-edit-policy.md) - recommended policy
- [`docs/final-evaluation-report.md`](docs/final-evaluation-report.md) - current evaluation summary
- [`docs/archive/`](docs/archive/) - old experiment logs

## Current status

実験的には使える段階です。

ただし、built-in `edit` より常に低コストとは言えません。現時点では次の使い方を推奨します。

- opt-in extension として使う
- 通常編集は tagged
- safety が必要な編集は hashline
- `--capture-session` で session I/O を確認する

## Limitations

- whole-line edit が中心です
- hash/tag は短いので collision risk はゼロではありません
- adaptive strict hashline で既知の危険ケースは緩和しています
- real repository での長期運用データはまだ不足しています

## License

MIT
