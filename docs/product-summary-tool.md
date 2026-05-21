# Product summary tool

## 日本語要約

複数の bench:product 結果を集計する product-summary tool の使い方です。mode/task 別の集計表を生成します。


`bench:product-summary` aggregates one or more `bench:product` result directories.

## Usage

```bash
npm run bench:product-summary -- \
  --out /tmp/pi-edit-selected-product-summary.md \
  /tmp/pi-edit-product-trials-selected-default-timeout-8000 \
  /tmp/pi-edit-product-trials-selected-validate-timeout-positive \
  /tmp/pi-edit-product-trials-selected-add-base-url-config \
  /tmp/pi-edit-product-trials-selected-update-large-route-entry
```

Inputs can be either run directories or direct `actual-results.json` paths.

The command prints JSON to stdout and optionally writes a Markdown summary with:

- by-mode aggregate
- by-task aggregate
- by-mode/task aggregate
- extension-observed tool I/O
- session-level tool I/O when present

## Smoke result

Using the selected 4-task × 3-trial runs, the generated summary reported:

| mode | runs | product | exact | avg ms | avg ext I/O | avg ext calls | avg session I/O | avg session calls | outcomes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `replace_edit_hashline` | 12 | 12/12 | 6/12 | 40255 | 4751 | 8.6 | 0 | 0 | `success_exact:6`, `success_product_only:6` |
| `replace_edit_hybrid` | 12 | 12/12 | 6/12 | 33910 | 3503 | 6.5 | 0 | 0 | `success_exact:6`, `success_product_only:6` |
| `replace_edit_tagged` | 12 | 12/12 | 6/12 | 31562 | 3125 | 5.3 | 0 | 0 | `success_exact:6`, `success_product_only:6` |

Session fields are zero for old result sets that were not run with `--capture-session`.

This matches the manually documented results while making future repeated-trial reporting less error-prone.

## Notes

The tool always reports extension-observed tool I/O. Built-in pi tool I/O appears in the session columns only for runs captured with `bench:product --capture-session`.
