# 推奨 edit replacement policy

English: [Recommended edit policy](../recommended-edit-policy.md)

対象は pi の built-in `edit` だけです。built-in `read`, `write`, `bash` は残します。

## 現在の推奨

単一の tool を万能扱いしません。用途ごとに分けます。

| 場面 | 推奨 tool path | 理由 |
| --- | --- | --- |
| 通常の product edit | `read_tagged` + `edit_tagged` | 自然利用と product cost のバランスが良い |
| safety-critical edit | `read_hashline` + `edit_hashline_range` | stale / collision / destructive edit safety が強い |
| hashline reject / anchor が不便 | `read_tagged` + `edit_tagged` | fallback として安定 |
| create file | `write` | `edit` 置き換えの範囲外 |
| delete / rename / move | `bash` または lifecycle tool | `edit` 置き換えの範囲外 |
| patch-style lifecycle | `edit_codex_patch` も候補 | add/delete/update を patch で扱える |

## 実用 default

`bench:product` では次の mode で実装しています。

```text
replace_edit_policy
```

Tool set:

```text
read, write, bash,
read_tagged, edit_tagged,
read_hashline, edit_hashline_range
```

Prompt policy:

```text
Use read_tagged + edit_tagged for normal existing-file content edits.
Use read_hashline + edit_hashline_range when stale safety is important or the edit targets a large/repeated file where exact anchors matter.
If a hashline edit is rejected, recover with read_tagged + edit_tagged.
Use write/bash for file creation, deletion, rename, and tests.
Do not use built-in edit.
```

## hashline-only を default にしない理由

`hashline_range` は安全性が高い一方で、product/natural run では read が増えやすい傾向がありました。

- selected product trials では 12/12 成功したが tagged より extension I/O が多い
- session I/O では simple task で built-in edit や tagged/hybrid の方が安いことがある
- `add-base-url-config` では broad / verification read が増えた

そのため、hashline は安全性重視の primitive として扱います。

## tagged を残す理由

`tagged` は自然利用と product benchmark で安定しています。

- natural-use 43 task: 43/43
- edit replacement product suite: 6/6
- selected repeated trials: 12/12
- extension-observed I/O が比較的低い

## hybrid を残す理由

Hybrid は hashline safety と tagged fallback を同時に使えます。ただし現在の prompt では hashline に寄りがちです。

改善候補:

- routing guidance を明確にする
- targeted read / search-first workflow を用意する
- simple edit では tagged を選ぶ example を増やす
- rejection diagnostics を改善する

## 採用スタンス

これは opt-in の extension/tool policy として使います。その policy では built-in `edit` を外し、extension tools で全面置換します。

pi core default を変える話ではありません。

実用スタンス:

1. extension-controlled `edit` replacement policy として使う
2. tagged を practical default にする
3. hashline_range を safety-critical edit に使う
4. write/bash を lifecycle に使う
5. built-in `edit` との cost 比較には session-level I/O を使う

## 残作業

- `pi_edit` を含む session-level repeated trials
- real repository fixture
- routing UX の改善
- final report の更新
