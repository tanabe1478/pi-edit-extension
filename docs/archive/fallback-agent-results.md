# Agent-level fallback validation

Japanese docs: [Japanese documentation](../ja/README.md)

## Command

```bash
npm run bench:fallback-agent -- \
  --out /tmp/pi-edit-fallback-agent3 \
  --timeout 180
```

## Tasks

1. `stale-strict-then-tagged`
   - first hashline range edit uses a stale strict anchor
   - expected to reject
   - fallback should tag-edit the current line
2. `plain-destructive-then-tagged`
   - first hashline range edit uses plain anchors for a destructive range
   - expected to reject
   - fallback should tag-delete the current lines

## Initial prompt-only result

The first version asked the model to call a normal failing `edit_hashline_range` first. Result:

| metric | value |
| --- | ---: |
| final file success | 2/2 |
| used tagged fallback | 2/2 |
| attempted hashline first | 0/2 |
| fallback after rejection | 0/2 |

The model completed both files successfully, but skipped the instructed failing hashline attempt and went directly to tagged fallback. Prompt-only instruction was not enough to force observing a rejection.

## Forced-rejection wrapper result

The runner now uses a benchmark-only tool:

```text
edit_hashline_range_reject_once
```

It always rejects without modifying the file and records a metric. The model then has to recover with tagged edits.

Command:

```bash
npm run bench:fallback-agent -- \
  --out /tmp/pi-edit-fallback-agent-forced \
  --timeout 180
```

Result:

| metric | value |
| --- | ---: |
| final file success | 2/2 |
| used tagged fallback | 2/2 |
| attempted hashline first | 2/2 |
| fallback after rejection | 2/2 |

## Interpretation

With a controlled rejecting tool, the model successfully recovered after observing rejection in both tasks.

This establishes three separate facts:

1. The fallback path works mechanically (`bench:fallback`).
2. The model may bypass an obviously failing first step if only prompted (`attemptedHashline 0/2` in the initial run).
3. When rejection is actually observed through a tool result, the model can recover with tagged fallback (`fallbackAfterRejection 2/2` with the wrapper).

## Current conclusion

For product behavior, direct fallback selection can be good: the final files were correct. For evaluating recovery after an actual tool rejection, a controlled rejection wrapper or multi-step harness is necessary. The wrapper-based harness confirms recovery is possible.
