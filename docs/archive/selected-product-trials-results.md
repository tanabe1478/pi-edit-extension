# Selected product repeated-trial results

## 日本語要約

selected product tasks を 3 trials ずつ実行した集計結果です。


This run validates selected edit-replacement modes across a small but meaningful task set with repeated trials.

## Commands

Each task was run with 3 trials and 3 edit-replacement modes:

```bash
for task in \
  default-timeout-8000 \
  validate-timeout-positive \
  add-base-url-config \
  update-large-route-entry
 do
  npm run bench:product -- \
    --out /tmp/pi-edit-product-trials-selected-$task \
    --modes replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
    --task $task \
    --trials 3 \
    --timeout 300
 done
```

## Aggregate result

Across 4 tasks × 3 trials = 12 runs per mode:

| mode | product_success | exact | extension tool I/O chars | avg tool I/O chars/run |
| --- | ---: | ---: | ---: | ---: |
| `replace_edit_tagged` | 12/12 | 6/12 | 37496 | 3125 |
| `replace_edit_hashline` | 12/12 | 6/12 | 57017 | 4751 |
| `replace_edit_hybrid` | 12/12 | 6/12 | 42041 | 3503 |

All modes completed all selected trials with product checks passing.

## Per-task summary

### `default-timeout-8000`

| mode | product_success | exact | avgToolIoChars | avgToolCalls | outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `replace_edit_tagged` | 3/3 | 3/3 | 3355 | 7.3 | `success_exact` ×3 |
| `replace_edit_hashline` | 3/3 | 3/3 | 3196 | 9.7 | `success_exact` ×3 |
| `replace_edit_hybrid` | 3/3 | 3/3 | 2825 | 8.3 | `success_exact` ×3 |

### `validate-timeout-positive`

| mode | product_success | exact | avgToolIoChars | avgToolCalls | outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `replace_edit_tagged` | 3/3 | 0/3 | 1971 | 4.0 | `success_product_only` ×3 |
| `replace_edit_hashline` | 3/3 | 0/3 | 4153 | 7.3 | `success_product_only` ×3 |
| `replace_edit_hybrid` | 3/3 | 0/3 | 2126 | 4.3 | `success_product_only` ×3 |

### `add-base-url-config`

| mode | product_success | exact | avgToolIoChars | avgToolCalls | outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `replace_edit_tagged` | 3/3 | 0/3 | 3451 | 6.0 | `success_product_only` ×3 |
| `replace_edit_hashline` | 3/3 | 0/3 | 8134 | 13.3 | `success_product_only` ×3 |
| `replace_edit_hybrid` | 3/3 | 0/3 | 5294 | 8.7 | `success_product_only` ×3 |

### `update-large-route-entry`

| mode | product_success | exact | avgToolIoChars | avgToolCalls | outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `replace_edit_tagged` | 3/3 | 3/3 | 3722 | 4.0 | `success_exact` ×3 |
| `replace_edit_hashline` | 3/3 | 3/3 | 3522 | 4.0 | `success_exact` ×3 |
| `replace_edit_hybrid` | 3/3 | 3/3 | 3769 | 4.7 | `success_exact` ×3 |

## Observations

- All edit-replacement modes were stable on product success for these selected tasks.
- Exact success depends heavily on task style. Simple deterministic edits and the large-route local edit reached exact success; broader implementation/test edits were product-only successes.
- `replace_edit_tagged` had the lowest aggregate extension-observed tool I/O in this run.
- `replace_edit_hashline` was competitive on deterministic local edits, but became expensive on `add-base-url-config` due to broader/verification reads.
- `replace_edit_hybrid` landed between tagged and hashline overall; in these trials it mostly followed the hashline path rather than tagged fallback.

## Current implication

For the current product suite, all three edit replacement policies are viable in terms of product correctness.

If optimizing for natural product cost and robustness in this small sample, `replace_edit_tagged` currently looks strongest. If optimizing for stale-anchor safety, `replace_edit_hashline` / `replace_edit_hybrid` still provide the stronger safety properties demonstrated by the failure benchmarks, but may need prompt/tool UX tuning to reduce unnecessary reads.
