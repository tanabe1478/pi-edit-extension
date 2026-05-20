# File lifecycle product results

This validates create/delete/rename tasks added in `docs/file-lifecycle-tasks.md`.

## Commands

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-lifecycle-all-create-logger-module \
  --modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch \
  --task create-logger-module \
  --timeout 300

npm run bench:product -- \
  --out /tmp/pi-edit-product-lifecycle-all-delete-legacy-module \
  --modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch \
  --task delete-legacy-module \
  --timeout 300

npm run bench:product -- \
  --out /tmp/pi-edit-product-lifecycle-all-rename-config-to-settings \
  --modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch \
  --task rename-config-to-settings \
  --timeout 300
```

## Product success

| task | pi_edit | tagged | hashline_range | hybrid_hashline_tagged | codex_patch |
| --- | ---: | ---: | ---: | ---: | ---: |
| create-logger-module | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| delete-legacy-module | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| rename-config-to-settings | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |

All modes completed all lifecycle tasks with tests passing.

## Exact match

| task | pi_edit | tagged | hashline_range | hybrid_hashline_tagged | codex_patch |
| --- | ---: | ---: | ---: | ---: | ---: |
| create-logger-module | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |
| delete-legacy-module | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| rename-config-to-settings | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |

The create-file task had product-correct variants with slightly different test names/style, so exact match was 0/1 for all modes.

## Tool I/O chars from extension metrics

| task | pi_edit | tagged | hashline_range | hybrid_hashline_tagged | codex_patch |
| --- | ---: | ---: | ---: | ---: | ---: |
| create-logger-module | 0 | 0 | 1500 | 1596 | 573 |
| delete-legacy-module | 0 | 0 | 1596 | 1596 | 74 |
| rename-config-to-settings | 0 | 0 | 1862 | 1862 | 396 |

Important caveat: built-in tools and `bash` are not instrumented by the extension metrics, so `pi_edit` and lifecycle operations performed entirely through `bash` can appear as `0`. These numbers are only extension-observed tool I/O.

## Observations

- File lifecycle operations are not solved by line-anchor edit tools alone.
- Because `bash` was available for lifecycle actions, all modes could create/delete/rename files successfully.
- For create/delete tasks, `tagged` often used only `bash`, so extension metrics were zero.
- `hashline_range` and `hybrid_hashline_tagged` tended to inspect existing files even when the task was mostly lifecycle-oriented.
- `codex_patch` represented create/delete/rename compactly in a single extension edit call.

## Implication

A practical product policy should not expose only `read_hashline` + `edit_hashline_range`. It needs at least one file lifecycle mechanism:

- built-in `write` / `bash`, or
- a dedicated create/delete/rename tool, or
- a patch tool such as `edit_codex_patch`.

For existing-file line edits, hashline range remains useful. For lifecycle edits, hybrid policy should explicitly route to lifecycle-capable tools.
