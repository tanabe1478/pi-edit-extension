# Agent-level fallback validation

This validation asks the model to exercise the fallback policy in an actual `pi -p` session:

1. First attempt `edit_hashline_range` with an intentionally rejected payload.
2. Observe the rejection.
3. Fall back to `read_tagged` + `edit_tagged`.

This differs from `bench:fallback`, which mechanically applies the policy without an LLM.

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

## Result

| metric | value |
| --- | ---: |
| final file success | 2/2 |
| used tagged fallback | 2/2 |
| attempted hashline first | 0/2 |
| fallback after rejection | 0/2 |

## Interpretation

The model completed both files successfully, but it **skipped the instructed failing hashline attempt** and went directly to the tagged fallback.

This happened even though the prompt said the first tool call must be `edit_hashline_range`. The model apparently inferred that the first call was expected to fail and optimized around it.

This is an important result:

- The fallback path works mechanically (`bench:fallback`).
- The model can complete the task with tagged fallback.
- But a prompt-only instruction is not enough to force observing a hashline rejection before fallback.

## Implication

To validate natural fallback after rejection, the harness needs stronger control than a single prompt. Options:

1. **Two-turn harness**
   - force/send the first tool call or otherwise create a state where the model has actually seen the rejection
   - then ask it to recover
2. **Benchmark-only tool wrapper**
   - expose a tool that intentionally rejects once, then requires recovery
3. **Stateful extension mode**
   - in a benchmark-only environment, make the first hashline edit for a target reject, then observe whether the model retries or falls back
4. **Accept bypass as valid policy**
   - if the model can identify that hashline is unsafe and choose tagged directly, that can be product-successful, but it is not evidence of recovery-after-rejection behavior

## Current conclusion

For product behavior, direct fallback selection can be good: the final files were correct. For evaluating recovery after an actual tool rejection, we need a controlled multi-step harness rather than prompt-only natural use.
