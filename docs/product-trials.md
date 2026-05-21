# Product repeated trials

`bench:product` now supports repeated trials for the same task/mode combination.

## CLI

```bash
npm run bench:product -- --trials 3
```

When `--trials N` is greater than 1, run directories are nested by trial:

```text
runs/<mode>/<task>/trial-1
runs/<mode>/<task>/trial-2
...
```

Each result record includes:

```json
"trial": 1
```

Summary totals include all trials.

## Smoke validation

Command:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-trials-smoke \
  --modes replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task add-base-url-config \
  --trials 2 \
  --timeout 300
```

## Result

| mode | product_success | exact | avg_duration_ms | avgToolIoChars | avgToolCalls |
| --- | ---: | ---: | ---: | ---: | ---: |
| `replace_edit_tagged` | 2/2 | 0/2 | 32982 | 3481 | 6.0 |
| `replace_edit_hashline` | 2/2 | 0/2 | 32855 | 4633 | 8.5 |
| `replace_edit_hybrid` | 2/2 | 0/2 | 34940 | 4426 | 8.0 |

All replacement modes passed product checks in both trials.

## Observations

- Exact match remained 0/2 for all modes because the task allows valid implementation/test-style variation.
- `replace_edit_tagged` had lower average extension-observed tool I/O in this small repeated run.
- Hashline modes performed more read/verification calls on this broader multi-file edit.
- The repeated trial output makes variance visible: tool I/O differs substantially between trials even for the same mode and task.

## Next use

Use repeated trials for a small but meaningful set before making product-level claims:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-trials-selected \
  --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task add-base-url-config \
  --trials 5 \
  --timeout 300
```

Then repeat for `validate-timeout-positive` and one simple line-edit task.
