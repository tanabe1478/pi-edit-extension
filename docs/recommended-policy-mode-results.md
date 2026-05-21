# Recommended policy mode results

`bench:product` now includes a mode named:

```text
replace_edit_policy
```

This mode implements the recommended split policy:

- normal existing-file edits: `read_tagged` + `edit_tagged`
- safety-sensitive / large / repeated file edits: `read_hashline` + `edit_hashline_range`
- hashline rejection fallback: `read_tagged` + `edit_tagged`
- lifecycle/test operations: built-in `write` / `bash`
- built-in `edit` is not available

## Smoke commands

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-policy-smoke \
  --modes replace_edit_policy \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session

npm run bench:product -- \
  --out /tmp/pi-edit-product-policy-route-smoke \
  --modes replace_edit_policy \
  --task update-large-route-entry \
  --timeout 300 \
  --capture-session
```

## Results

| task | product | exact | chosen edit path | session I/O | session calls |
| --- | ---: | ---: | --- | ---: | ---: |
| `default-timeout-8000` | 1/1 | 1/1 | tagged | 11474 | 18 |
| `update-large-route-entry` | 1/1 | 1/1 | hashline | 5173 | 8 |

## Observations

- The model followed the intended split at a high level:
  - normal config/test edit used tagged tools;
  - larger repeated route file used hashline tools.
- Product and exact success were both 2/2.
- The tagged path still over-read in `default-timeout-8000`; it read many unrelated files before editing.
- The route task was clean and close to the desired behavior.

## Implication

The policy split is understandable to the model, but prompt/tool UX still needs tuning to reduce exploratory reads for simple tasks. The next improvement should be targeted read guidance or narrower discovery tools, not another edit primitive.
