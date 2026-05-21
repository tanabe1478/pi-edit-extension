# Tool I/O accounting

Japanese docs: [Japanese documentation](ja/README.md)

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
