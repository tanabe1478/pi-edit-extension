# 最終評価レポート draft

English: [Final evaluation report](../final-evaluation-report.md)

## Goal

pi の built-in `edit` を、より安全または短い edit primitive で置き換えられるかを評価します。

評価対象:

- tagged line edits
- adaptive strict hashline range edits
- hybrid policy
- Codex-style patch edits
- CRC range edits

Product scope は built-in `edit` だけの置き換えです。`read`, `write`, `bash` は残します。

## 実装済み tools

Primary candidates:

- `read_tagged`
- `edit_tagged`
- `read_hashline`
- `edit_hashline_range`

Additional tools:

- `search_hashline`
- `edit_hashline_patch`
- `read_hashline_legacy`
- `edit_hashline_patch_legacy`
- `edit_crc_range`
- `edit_codex_patch`
- `edit_hashline_range_reject_once`

## Safety findings

Failure/stress benchmark では次を確認しました。

- stale anchor rejection
- same-line 2-character hash collision risk
- destructive plain-endpoint rejection
- strict endpoint acceptance
- CRC unrelated-change rejection
- Codex fuzzy matching behavior
- hashline rejection 後の tagged fallback

Key result:

- legacy compact `LINEhh` は same-line stale 2-char collision を false accept し得る
- adaptive strict hashline はその case を reject する
- `hashline_range` は destructive plain endpoints を reject する
- controlled hashline rejection 後、tagged fallback で recover できる

## Payload benchmark findings

43 tasks の synthetic payload benchmark:

| mode | chars | saved vs pi_edit |
| --- | ---: | ---: |
| `pi_edit` | 42932 | baseline |
| `tagged` | 9919 | 76.9% |
| `codex_patch` | 60608 | -41.2% |
| `hashline_legacy` | 3882 | 91.0% |
| `hashline` | 4167 | 90.3% |
| `crc` | 5756 | 86.6% |

Payload-only では hashline が強いですが、product/natural run では read overhead も重要です。

## Natural-use findings

- first 5 all modes:
  - `tagged`: 5/5
  - `hashline_legacy`: 5/5
  - free-form `hashline`: model patch construction error が出た
  - `hashline_range`: follow-up で 5/5
- full 43 comparison:
  - `tagged`: 43/43
  - `hashline_range`: 43/43

`edit_hashline_range` は free-form hashline patch より自然利用に向いています。

## Product benchmark findings

Edit replacement product suite:

| mode | product_success | exact | checks_pass |
| --- | ---: | ---: | ---: |
| `pi_edit` | 6/6 | 4/6 | 6/6 |
| `replace_edit_tagged` | 6/6 | 5/6 | 6/6 |
| `replace_edit_hashline` | 6/6 | 4/6 | 6/6 |
| `replace_edit_hybrid` | 6/6 | 3/6 | 6/6 |

Selected repeated trials, 4 tasks × 3 trials:

| mode | product_success | exact | avg extension I/O/run |
| --- | ---: | ---: | ---: |
| `replace_edit_tagged` | 12/12 | 6/12 | 3125 |
| `replace_edit_hashline` | 12/12 | 6/12 | 4751 |
| `replace_edit_hybrid` | 12/12 | 6/12 | 3503 |

## Session-level I/O findings

Session-level I/O は built-in tools も含みます。

Two-task session comparison:

| mode | product | exact | avg session I/O |
| --- | ---: | ---: | ---: |
| `pi_edit` | 2/2 | 2/2 | 5132 |
| `replace_edit_tagged` | 2/2 | 2/2 | 7502 |
| `replace_edit_hashline` | 2/2 | 2/2 | 9231 |
| `replace_edit_hybrid` | 2/2 | 2/2 | 6913 |

Simple task では built-in `edit` が session I/O でまだ強いです。

Relevant-file hints は I/O を大きく下げました。

| task | before | after | change |
| --- | ---: | ---: | ---: |
| `default-timeout-8000` policy mode | 11474 | 2779 | -75.8% |
| `update-large-route-entry` policy mode | 5173 | 5059 | -2.2% |

## Current recommendation

opt-in extension policy として built-in `edit` を外し、次を使います。

```text
read, write, bash,
read_tagged, edit_tagged,
read_hashline, edit_hashline_range
```

Routing:

- default normal edits: `read_tagged` + `edit_tagged`
- safety / stale-sensitive / large repeated edits: `read_hashline` + `edit_hashline_range`
- fallback: `read_tagged` + `edit_tagged`
- lifecycle: `write` / `bash`

## なぜ policy-based replacement か

- replacement policies の product correctness は強い
- session I/O は built-in `edit` に常勝ではない
- hashline は安全だが read overhead がある
- tagged は自然利用に強いが hashline ほど strict ではない
- したがって一枚岩の tool ではなく routing policy が良い

## 残作業

1. `pi_edit` を含む session-level repeated trials
2. real repository fixture
3. large/repeated files で hashline を選びやすくする routing UX
4. larger run の failure classification review
5. adoption docs and examples

## Status

機能実装と benchmark は揃っています。built-in `edit` を tool set から外す opt-in trial に使える段階です。
