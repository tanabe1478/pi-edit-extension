# Product outcome classification

## 日本語要約

bench:product の outcomeCategory 分類を説明します。成功・product-only 成功・timeout・test failure などを分類します。


`bench:product` now classifies every run with an `outcomeCategory`.

## Categories

| category | meaning |
| --- | --- |
| `success_exact` | product checks passed and expected files matched exactly |
| `success_product_only` | product checks passed, but exact files differed |
| `timeout` | pi process timed out |
| `tool_rejection_unrecovered` | an edit/rejection signal was observed and the task did not recover |
| `syntax_or_tool_misuse` | pi failed with tool/schema/parameter-looking error output |
| `pi_failed` | pi process exited non-zero for another reason |
| `tests_failed` | pi returned success but product tests failed |
| `unexpected_file_present` | expected a file to be absent but it remained |
| `missing_file` | expected a file was missing |
| `exact_mismatch_only` | exact mismatch without another failure signal |
| `unknown` | fallback category |

## Summary

Mode summaries now include counts:

```json
"outcomeCategories": {
  "success_exact": 3,
  "success_product_only": 2
}
```

## Notes

`success_product_only` is not a failure. It is common for product tasks where multiple implementations or test styles are valid.

The classifier is intentionally simple and conservative. It is meant to make larger/repeated runs easier to scan, not to replace manual inspection for surprising failures.
