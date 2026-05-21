# Structured hashline range tool validation

Japanese docs: [Japanese documentation](../ja/archive/hashline-range-results.md)

## Motivation

The first natural-use validation showed that adaptive `hashline` can fail even when the underlying tool can apply the correct edit. The failures were caused by the model constructing the free-form hashline patch incorrectly, for example using insertion-like syntax or leaving the original line in place.

To reduce protocol errors, the extension added a structured tool:

```text
edit_hashline_range
```

It accepts explicit fields instead of the free-form patch language:

```json
{
  "path": "fixture.ts",
  "start": "12ab[:tag]",
  "end": "12ab[:tag]",
  "newText": "replacement text"
}
```

Empty `newText` deletes the range. The tool still uses the same adaptive strict anchor validation internally.

## Run

Command:

```bash
npm run bench:natural -- \
  --out /tmp/pi-edit-natural-range-5 \
  --modes hashline,hashline_range \
  --limit 5 \
  --timeout 180
```

This re-ran the first five natural-use scenarios comparing the free-form adaptive hashline patch tool against the structured range tool.

## Result

| mode | success | total | avg_duration_ms |
| --- | ---: | ---: | ---: |
| `hashline` | 4 | 5 | 14290 |
| `hashline_range` | 5 | 5 | 14941 |

## Interpretation

`hashline_range` fixed the one-line replacement failure seen with free-form `hashline` in this run. It also completed the multi-line insertion-shaped replacement successfully.

The structured tool is slightly less compact than raw hashline patch in some cases, but it reduces the model's syntax burden:

- no `= A..B` line to compose
- no `~` payload prefixing
- no accidental `+`/`<` insertion operation
- replacement vs deletion is controlled by `newText`

The result supports the hypothesis that the remaining gap is largely **tool ergonomics**, not anchor validation.

## Current recommendation

For natural LLM use, prefer:

```text
read_hashline + edit_hashline_range
```

over:

```text
read_hashline + edit_hashline_patch
```

Keep `edit_hashline_patch` for compatibility with oh-my-pi-style patches and for cases where multiple operations in one payload are valuable.

## Next checks

1. Run `hashline_range` across all 43 natural-use scenarios.
2. Compare against `tagged`, which was 5/5 in the first natural-use run.
3. Add failure/stress cases specifically for `edit_hashline_range`:
   - stale strict anchor rejects
   - destructive range requires strict endpoints
   - same-line 2-character collision rejects when strict tag is present
4. Consider adding `edit_hashline_insert` if insertion operations remain important in real tasks.
