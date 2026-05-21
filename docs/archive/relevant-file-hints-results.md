# Relevant file hints results

日本語: [日本語ドキュメント](../ja/README.md)

## Smoke commands

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-policy-hints-smoke \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session

npm run bench:product -- \
  --out /tmp/pi-edit-product-policy-hints-route-smoke \
  --modes replace_edit_policy \
  --task update-large-route-entry \
  --timeout 300 \
  --capture-session
```

## Result

| task | product | exact | chosen path | session I/O | session calls |
| --- | ---: | ---: | --- | ---: | ---: |
| `default-timeout-8000` | 1/1 | 1/1 | tagged | 2779 | 5 |
| `update-large-route-entry` | 1/1 | 1/1 | tagged | 5059 | 6 |

## Comparison with previous policy-mode smoke

| task | before session I/O | after session I/O | change |
| --- | ---: | ---: | ---: |
| `default-timeout-8000` | 11474 | 2779 | -75.8% |
| `update-large-route-entry` | 5173 | 5059 | -2.2% |

## Observations

- Relevant file hints dramatically reduced broad exploratory reads on `default-timeout-8000`.
- The model used tagged tools for both smoke tasks after hints.
- For `update-large-route-entry`, the earlier no-hint policy selected hashline; with relevant file hints it selected tagged. Product/exact success remained 1/1.
- This suggests file targeting guidance is currently more important for cost than adding another edit primitive.

## Implication

The recommended policy should include target-file guidance whenever the caller/task can provide it.

Open question: if we want `replace_edit_policy` to prefer hashline for large/repeated files even with file hints, the prompt needs stronger routing language or an explicit task flag. For now, tagged remains a strong low-friction default.
