# 推奨 edit policy

English: [Recommended edit policy](../recommended-edit-policy.md)

## 結論

単一 tool で全てを置き換えるのではなく、用途で分けます。

| 場面 | 推奨 |
| --- | --- |
| 通常編集 | tagged |
| safety / stale-sensitive | hashline |
| hashline reject | tagged fallback |
| file lifecycle | `write` / `bash` |

## 推奨 tool set

```text
read, write, bash,
read_tagged, edit_tagged,
read_hashline, edit_hashline_range
```

built-in `edit` は外します。

## なぜ tagged default か

- 自然利用で安定しています。
- product benchmark で成功率が高いです。
- hashline より read が少ない傾向があります。

## なぜ hashline も残すか

- stale detection が強いです。
- collision / destructive edit の防御があります。
- large / repeated file では anchor の価値があります。

## 注意

built-in `edit` より常に低コストとは言えません。最終比較では `--capture-session` を使ってください。
