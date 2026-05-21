# Natural-use 43-task validation: tagged vs hashline_range

Japanese docs: [Japanese documentation](../ja/archive/natural-use-43-results.md)

## Run

Command:

```bash
npm run bench:natural -- \
  --out /tmp/pi-edit-natural-43-tagged-range \
  --modes tagged,hashline_range \
  --timeout 180
```

Modes compared:

- `tagged`: `read_tagged` + `edit_tagged`
- `hashline_range`: `read_hashline` + `edit_hashline_range`

## Result

| mode | success | total | avg_duration_ms |
| --- | ---: | ---: | ---: |
| `tagged` | 43 | 43 | 11047 |
| `hashline_range` | 43 | 43 | 13190 |

Both modes completed all 43 natural-use scenarios.

## Interpretation

This is the strongest natural-use result so far:

- The earlier free-form `hashline` patch tool failed some natural-use tasks because the model constructed patch syntax incorrectly.
- The structured `edit_hashline_range` tool removed that failure mode for this 43-task suite.
- `tagged` remains faster in this run and is still a very strong natural-use baseline.
- `hashline_range` preserves adaptive strict anchor validation while being usable enough for the model to complete all scenarios.

## Comparison with earlier natural-use run

Earlier first-5 run:

| mode | success | total |
| --- | ---: | ---: |
| `tagged` | 5 | 5 |
| free-form `hashline` | 3 | 5 |
| `hashline_range` follow-up | 5 | 5 |

Full 43-task run:

| mode | success | total |
| --- | ---: | ---: |
| `tagged` | 43 | 43 |
| `hashline_range` | 43 | 43 |

This supports the hypothesis that adaptive hashline's main natural-use blocker was not anchor validation, but free-form patch ergonomics.

## Remaining caveats

This is still a synthetic fixture suite. It does not yet cover:

- real repository structure
- multi-file edits
- file creation/deletion/rename
- formatter-sensitive config files
- test execution after edits
- fallback policy when a mode rejects or fails
- natural model choice among multiple available edit tools

## Next validation steps

1. Add `edit_hashline_range` to the failure/stress suite.
2. Run natural-use with `pi_edit`, `tagged`, `hashline_range`, and `codex_patch` on selected real repository fixtures.
3. Add final-diff classification to `bench:natural` failures.
4. Add retry/fallback policy evaluation:
   - first try `hashline_range`
   - on strict rejection, re-read and retry
   - on repeated failure, fallback to `tagged` or `pi_edit`
5. Measure total tokens including read output, not just edit payload.

## Current recommendation update

For natural line-oriented edits, the best candidates are now:

1. `tagged` for simple robust natural use
2. `hashline_range` for compact adaptive strict anchors

Free-form `edit_hashline_patch` should remain available for compatibility and multi-op compact patches, but should not be the primary natural-use interface.
