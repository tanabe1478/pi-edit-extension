# Natural-use validation results

## 日本語要約

初期 natural-use validation の結果と free-form hashline の課題をまとめています。


This document records natural-use validations where the model is **not** given a precomputed edit payload. It must inspect `fixture.ts`, choose the allowed tools, and construct the edit payload itself.

The runner is:

```bash
npm run bench:natural -- --out <dir> --modes <modes> --limit <n> --timeout <sec>
```

## Run: first 5 scenarios, all modes

Command:

```bash
npm run bench:natural -- \
  --out /tmp/pi-edit-natural-5-all \
  --modes pi_edit,tagged,codex_patch,hashline_legacy,hashline,crc \
  --limit 5 \
  --timeout 180
```

Scenarios:

1. one-line replacement
2. small block replacement
3. large deletion
4. large replacement
5. multi-line insertion-shaped replacement

## Summary

| mode | success | total | avg_duration_ms |
| --- | ---: | ---: | ---: |
| `pi_edit` | 3 | 5 | 22634 |
| `tagged` | 5 | 5 | 12170 |
| `codex_patch` | 2 | 5 | 22095 |
| `hashline_legacy` | 5 | 5 | 89050 |
| `hashline` | 3 | 5 | 21039 |
| `crc` | 1 | 5 | 28278 |

## Important finding

This natural-use run **does** contain cases where `pi_edit` succeeded and adaptive `hashline` failed:

| scenario | `pi_edit` | `hashline` | observed hashline issue |
| --- | --- | --- | --- |
| one-line replacement | success | fail | model inserted/shifted instead of exact replacement |
| multi-line insertion-shaped replacement | success | fail | model left the original target line in place, causing an extra line |

So the earlier statement remains true only for payload-injected clean runs: when the correct hashline payload is supplied, adaptive hashline applied all 43 tasks. In natural use, the model can construct the wrong hashline patch.

## Other notable differences

### `tagged` was strongest in this small natural-use run

`tagged` completed 5/5 with the shortest average duration among successful all-task modes. It seems easier for the model to use naturally because the edit payload is structurally simple:

```text
line:tag
```

plus `newText`.

### `hashline_legacy` completed 5/5 but was very slow

`hashline_legacy` succeeded on all five tasks, but average duration was high. The tool metrics show repeated reads and verification reads. This suggests the model can eventually use compact hashline anchors, but may spend many turns checking itself.

### adaptive `hashline` succeeded on larger line-range tasks

Adaptive `hashline` succeeded on:

- small block replacement
- large deletion
- large replacement

This is encouraging because these are the cases where hashline has the largest payload advantage. However, it failed two small replacement/expansion tasks due to model patch construction errors.

### `pi_edit` struggled on large natural edits

`pi_edit` succeeded on small tasks but failed the large deletion and large replacement in this run. The final file was unchanged for those large tasks. This indicates that natural `pi_edit` usage can also fail when the model must construct large exact `oldText` payloads.

### `codex_patch` was mixed

`codex_patch` succeeded on one-line replacement and multi-line insertion-shaped replacement, but failed on small block replacement and large edits. In failed cases, the final file was often unchanged. This suggests the model may under-specify or misconstruct context patches naturally.

### `crc` performed poorly in natural use

`crc` succeeded only on the large deletion. It frequently introduced extra blank lines or off-by-one content because the model had to combine file CRC metadata with precise line ranges. It also performed many large reads.

## Interpretation

The natural-use result changes the replacement story:

- **Payload-injected clean benchmark:** adaptive `hashline` appears replacement-capable for line-oriented edits: 43/43 success.
- **Natural-use benchmark:** adaptive `hashline` is promising but not yet a drop-in replacement: 3/5 success in the first small run.

The failures are not tool application bugs. They are mostly **model/tool-protocol usability failures**:

- using insertion where replacement was required
- leaving the original line in place
- reading/rechecking too much
- losing exact intent while constructing patch syntax

This means the next improvements should focus on tool ergonomics and recovery, not only checksum safety.

## Follow-up ideas

1. Add a higher-level `edit_hashline_range` tool that accepts:

```json
{
  "path": "fixture.ts",
  "start": "12ab[:tag]",
  "end": "12ab[:tag]",
  "newText": "..."
}
```

This could reduce model mistakes with `= A..B` and payload `~` syntax.

2. Improve `edit_hashline_patch` diagnostics for suspicious edits:

- replacing one line with two lines is OK, but inserting next to target when the prompt says replace should be detectable only at harness level; still, diagnostics can report operation counts clearly.
- warn when a patch contains `+`/`<` but the task is likely replacement is not generally knowable by the tool, but benchmark prompts can detect this.

3. Add a natural-use retry/fallback policy:

- if hashline final diff mismatches expected in eval, retry with a simpler structured range tool
- then fallback to `tagged` or `pi_edit`

4. Run a larger natural-use suite after adding the higher-level range tool.

5. Add per-task failure classification to `bench:natural` output so these findings are machine-readable.
