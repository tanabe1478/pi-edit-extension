# Hybrid tool policy validation

This validation checks a simple fallback/tool-choice policy:

1. Prefer `read_hashline` + `edit_hashline_range` for line-oriented edits.
2. If hashline anchors are inconvenient or rejected, fall back to `read_tagged` + `edit_tagged`.
3. Do not use built-in `edit`.

The goal is to see whether giving the model both compact adaptive hashline and robust tagged edits causes confusion, or whether it can still complete product-level tasks.

## Runner support

`bench:product` now supports:

```text
hybrid_hashline_tagged
```

Allowed modification tools:

```text
read_hashline, edit_hashline_range, read_tagged, edit_tagged
```

`bash` is also available for running checks.

## Run

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-hybrid-3 \
  --modes hybrid_hashline_tagged \
  --timeout 240
```

## Result

| mode | product_success | exact | checks_pass | avg_duration_ms |
| --- | ---: | ---: | ---: | ---: |
| `hybrid_hashline_tagged` | 3/3 | 2/3 | 3/3 | 23718 |

## Tool choice observed

In this run, the model used `read_hashline` + `edit_hashline_range` for all file modifications. It did not need to fall back to tagged edits.

This is useful: simply exposing tagged as a fallback did not derail the model from the preferred hashline-range path.

## Interpretation

The hybrid policy is product-successful on the current 3-task product suite.

Compared with earlier single-mode results:

| mode | product_success | exact | avg_duration_ms |
| --- | ---: | ---: | ---: |
| `tagged` | 3/3 | 3/3 | 25428 |
| `hashline_range` | 3/3 | 2/3 | 22946 |
| `codex_patch` | 3/3 | 2/3 | 21099 |
| `pi_edit` | 3/3 | 1/3 | 61676 |
| `hybrid_hashline_tagged` | 3/3 | 2/3 | 23718 |

The hybrid result is close to `hashline_range`, because the model stayed on hashline_range. The next useful validation is to add tasks where hashline_range is intentionally unsuitable or rejected, to see whether the model actually falls back to tagged edits.

## Next fallback stress cases

Add product tasks or harness variants that force fallback:

1. Stale hashline anchor after read, then allow tagged fallback.
2. File lifecycle edits where hashline_range cannot operate.
3. Ambiguous or rejected strict-anchor range, then tagged retry.
4. Multi-file edits where one file is line-oriented and another needs a different tool.
