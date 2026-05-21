# Tool I/O accounting

## 日本語要約

extension metrics に基づく tool I/O 集計の定義と caveat を説明します。


Natural and product-level runs need a different cost metric than precomputed edit payload size.

In payload-injected benchmarks, the main question is:

> How many chars/tokens does the edit payload require?

In natural/product runs, the model also spends tool I/O on:

- reading files
- re-reading after uncertainty
- verification reads
- retry attempts
- fallback attempts

Therefore `bench:product` now aggregates tool I/O from the extension metrics JSONL.

## Fields

Each product run record includes:

```json
"toolIo": {
  "toolCalls": 0,
  "readCalls": 0,
  "editCalls": 0,
  "readResultChars": 0,
  "editInputChars": 0,
  "totalToolIoChars": 0
}
```

The mode summary also includes totals plus:

```json
"avgToolIoChars": 0,
"avgToolCalls": 0
```

## Counting rules

- `resultChars` contributes to `readResultChars`.
- `inputChars` or `taggedInputChars` contributes to `editInputChars`.
- `totalToolIoChars = readResultChars + editInputChars`.
- Tool names starting with `read` count as read calls.
- Tool names starting with `edit` count as edit calls.

This is approximate but useful for comparing natural-use modes.

## Caveats

- Built-in `pi_edit` currently has no extension metrics, so its tool I/O appears as zero in this accounting.
- This measures tool payload/result chars, not full model context tokens.
- `bash` calls are not counted unless they are instrumented separately.

## Why this matters

`hashline_range` has compact edit calls, but may require larger or repeated reads. `tagged` may have larger edit payloads but simpler natural use. Total tool I/O helps compare those tradeoffs more honestly.
