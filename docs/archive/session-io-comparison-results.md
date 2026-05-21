# Session I/O comparison results

日本語: [日本語ドキュメント](../ja/README.md)

## Commands

```bash
for task in default-timeout-8000 update-large-route-entry; do
  npm run bench:product -- \
    --out /tmp/pi-edit-product-session-compare-$task \
    --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
    --task $task \
    --timeout 300 \
    --capture-session
 done

npm run bench:product-summary -- \
  --out /tmp/pi-edit-session-compare-summary.md \
  /tmp/pi-edit-product-session-compare-default-timeout-8000 \
  /tmp/pi-edit-product-session-compare-update-large-route-entry
```

## Aggregate result

| mode | runs | product | exact | avg ms | avg ext I/O | avg ext calls | avg session I/O | avg session calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `pi_edit` | 2 | 2/2 | 2/2 | 24480 | 0 | 0 | 5132 | 10.5 |
| `replace_edit_hashline` | 2 | 2/2 | 2/2 | 33138 | 5337 | 8.5 | 9231 | 13.5 |
| `replace_edit_hybrid` | 2 | 2/2 | 2/2 | 25218 | 4773 | 7.0 | 6913 | 12.0 |
| `replace_edit_tagged` | 2 | 2/2 | 2/2 | 30001 | 2688 | 4.0 | 7502 | 14.0 |

## Per-task highlights

### `default-timeout-8000`

| mode | session I/O | session calls |
| --- | ---: | ---: |
| `pi_edit` | 5305 | 14 |
| `replace_edit_tagged` | 9642 | 20 |
| `replace_edit_hashline` | 12156 | 18 |
| `replace_edit_hybrid` | 8902 | 17 |

### `update-large-route-entry`

| mode | session I/O | session calls |
| --- | ---: | ---: |
| `pi_edit` | 4958 | 7 |
| `replace_edit_tagged` | 5361 | 8 |
| `replace_edit_hashline` | 6305 | 9 |
| `replace_edit_hybrid` | 4924 | 7 |

## Observations

- Session-level accounting makes `pi_edit` comparable; extension-only I/O still shows `pi_edit` as 0.
- On this 2-task single-trial sample, built-in `pi_edit` had the lowest average session I/O.
- `replace_edit_hybrid` was close to `pi_edit` on the large-route localized edit and had the lowest session I/O for that task by a small margin.
- `default-timeout-8000` caused replacement modes, especially hashline, to read more context than necessary.
- Product success and exact success were 2/2 for all modes.

## Implication

The earlier extension-only I/O comparisons were useful but incomplete. For product-level adoption decisions, `--capture-session` should be used on selected final runs.

Current evidence suggests:

- replacement modes are product-correct on these tasks;
- built-in `edit` remains competitive or better on total session I/O in simple tasks;
- hashline/hybrid may be most justified where safety/staleness detection matters or large-file local edits offset read overhead.
