# Final evaluation report draft

This is a living final report for the edit replacement experiment.

## Goal

Evaluate whether pi's built-in `edit` tool can be replaced or augmented by safer/shorter edit primitives:

- tagged line edits
- adaptive strict hashline range edits
- hybrid policy
- Codex-style patch edits
- CRC range edits

The clarified product scope is replacing only built-in `edit`. Built-in `read`, `write`, and `bash` can remain available.

## Implemented tools

Primary candidates:

- `read_tagged`
- `edit_tagged`
- `read_hashline`
- `edit_hashline_range`

Additional tools:

- `search_hashline`
- `edit_hashline_patch`
- `read_hashline_legacy`
- `edit_hashline_patch_legacy`
- `edit_crc_range`
- `edit_codex_patch`
- `edit_hashline_range_reject_once` benchmark-only rejection tool

## Safety findings

Failure/stress benchmarks cover:

- stale anchor rejection
- same-line 2-character hash collision risk
- destructive plain-endpoint rejection
- strict endpoint acceptance
- CRC unrelated-change rejection
- Codex fuzzy matching behavior
- deterministic fallback after hashline rejection

Key result:

- legacy compact `LINEhh` can false-accept a same-line stale 2-char collision;
- adaptive strict hashline rejects that case;
- `hashline_range` rejects destructive plain endpoints and accepts strict endpoints;
- tagged fallback can recover after controlled hashline rejection.

## Payload benchmark findings

Clean synthetic payload benchmark over 43 tasks:

| mode | chars | saved vs pi_edit |
| --- | ---: | ---: |
| `pi_edit` | 42932 | baseline |
| `tagged` | 9919 | 76.9% |
| `codex_patch` | 60608 | -41.2% |
| `hashline_legacy` | 3882 | 91.0% |
| `hashline` | 4167 | 90.3% |
| `crc` | 5756 | 86.6% |

Payload-only results favor hashline, but product/natural runs show read overhead matters.

## Natural-use findings

Important natural-use results:

- first 5 all modes:
  - `tagged`: 5/5
  - `hashline_legacy`: 5/5
  - free-form `hashline`: weaker due to model patch construction errors
  - `hashline_range`: improved to 5/5 in follow-up
- full 43 comparison:
  - `tagged`: 43/43
  - `hashline_range`: 43/43

Structured `edit_hashline_range` is much better for natural LLM use than free-form hashline patches.

## Product benchmark findings

Edit replacement product suite result:

| mode | product_success | exact | checks_pass |
| --- | ---: | ---: | ---: |
| `pi_edit` | 6/6 | 4/6 | 6/6 |
| `replace_edit_tagged` | 6/6 | 5/6 | 6/6 |
| `replace_edit_hashline` | 6/6 | 4/6 | 6/6 |
| `replace_edit_hybrid` | 6/6 | 3/6 | 6/6 |

Selected repeated trials, 4 tasks × 3 trials:

| mode | product_success | exact | avg extension I/O/run |
| --- | ---: | ---: | ---: |
| `replace_edit_tagged` | 12/12 | 6/12 | 3125 |
| `replace_edit_hashline` | 12/12 | 6/12 | 4751 |
| `replace_edit_hybrid` | 12/12 | 6/12 | 3503 |

All replacement modes were product-correct in these selected trials.

## Session-level I/O findings

Session-level I/O captures built-in tools too.

Two-task session comparison:

| mode | product | exact | avg session I/O |
| --- | ---: | ---: | ---: |
| `pi_edit` | 2/2 | 2/2 | 5132 |
| `replace_edit_tagged` | 2/2 | 2/2 | 7502 |
| `replace_edit_hashline` | 2/2 | 2/2 | 9231 |
| `replace_edit_hybrid` | 2/2 | 2/2 | 6913 |

This shows built-in `edit` remains competitive on total tool I/O for simple tasks.

Relevant-file hints significantly reduce I/O:

| task | before | after | change |
| --- | ---: | ---: | ---: |
| `default-timeout-8000` policy mode | 11474 | 2779 | -75.8% |
| `update-large-route-entry` policy mode | 5173 | 5059 | -2.2% |

## Current recommendation

Do not globally replace built-in `edit` yet.

Recommended extension policy:

```text
read, write, bash,
read_tagged, edit_tagged,
read_hashline, edit_hashline_range
```

Routing:

- default normal edits: `read_tagged` + `edit_tagged`
- safety/stale-sensitive or large/repeated edits: `read_hashline` + `edit_hashline_range`
- fallback after hashline rejection: `read_tagged` + `edit_tagged`
- file lifecycle: built-in `write` / `bash`

## Why not full replacement yet?

- Product correctness is strong, but session I/O does not consistently beat built-in `edit`.
- Hashline safety is valuable, but read overhead can be high without target-file guidance.
- Tagged is robust and natural, but lacks hashline's stricter stale/collision properties.
- The best path is policy-based routing rather than one universal edit primitive.

## Remaining work

Before calling this production-ready:

1. More session-level repeated trials including `pi_edit`.
2. Real-repository fixture.
3. Better routing UX so large/repeated files select hashline only when worth it.
4. Failure-classification review on larger runs.
5. Final adoption docs and examples.

## Status

The project is now a functional, benchmarked extension with a documented recommended policy. It is not yet proven as a universal built-in `edit` replacement, but it is ready for targeted extension-based trials.
