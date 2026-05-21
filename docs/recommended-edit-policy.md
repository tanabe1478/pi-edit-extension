# Recommended edit replacement policy

Japanese docs: [Japanese documentation](ja/README.md)

## Current recommendation

Do not treat one tool as universally best. Use a policy split:

| situation | recommended tool path | reason |
| --- | --- | --- |
| normal natural product editing | `read_tagged` + `edit_tagged` | strongest natural/product cost profile so far |
| safety-critical existing-file edit | `read_hashline` + `edit_hashline_range` | stale/collision/destructive edit safety |
| hashline rejected or anchors inconvenient | `read_tagged` + `edit_tagged` | robust fallback |
| create file | built-in `write` | outside `edit` replacement scope |
| delete/rename/move | built-in `bash` or dedicated lifecycle tool | outside `edit` replacement scope |
| patch-style lifecycle or large structural change | consider `edit_codex_patch` | add/delete/update can be compact in patch form |

## Practical default

For near-term pi usage, the most practical default replacement policy is implemented in `bench:product` as:

```text
replace_edit_policy
```

The tool set is:

```text
read, write, bash,
read_tagged, edit_tagged,
read_hashline, edit_hashline_range
```

Prompt/policy:

```text
Use read_tagged + edit_tagged for normal existing-file content edits.
Use read_hashline + edit_hashline_range when stale safety is important or the edit targets a large/repeated file where exact anchors matter.
If a hashline edit is rejected, recover with read_tagged + edit_tagged.
Use write/bash for file creation, deletion, rename, and tests.
Do not use built-in edit.
```

## Why not hashline-only as default?

`hashline_range` has the strongest safety properties, but product/natural runs showed it often reads more context than needed.

Examples:

- selected product trials: product success 12/12, but higher average extension-observed I/O than tagged
- session I/O comparison: simple tasks showed built-in edit and tagged/hybrid can be cheaper than hashline
- `add-base-url-config`: hashline modes performed broad/verification reads

Therefore hashline is best positioned as a safety-oriented edit primitive, not necessarily the cheapest default for every natural edit.

## Why keep tagged?

`tagged` performed well across natural and product validations:

- natural-use full 43 comparison: `tagged` 43/43
- edit replacement product suite: `replace_edit_tagged` 6/6
- selected repeated trials: `replace_edit_tagged` 12/12
- generally lower extension-observed tool I/O in product trials

It is a strong practical fallback and likely default for natural use.

## Why keep hybrid?

Hybrid is still valuable because it exposes the safe hashline path and the robust tagged fallback together. However, current prompts tend to make the model choose hashline frequently, even when tagged would be cheaper.

Hybrid needs UX tuning:

- clearer routing guidance
- maybe a dedicated `read_hashline_targeted` or search-first workflow
- model-facing examples that prefer tagged for simple edits
- stronger fallback diagnostics

## Current adoption stance

This should be used as an opt-in extension/tool policy. In that policy, built-in `edit` is intentionally omitted and fully replaced by the extension tools.

This project is not about changing pi core defaults or all-user behavior. The practical stance is:

1. ship/use as an extension-controlled `edit` replacement policy;
2. use `tagged` as the practical default edit path;
3. expose `hashline_range` for safety-critical/stale-sensitive edits;
4. keep `write`/`bash` for lifecycle operations;
5. continue measuring session-level I/O before claiming cost wins over built-in `edit`.

## Remaining validation before final recommendation

- more session-level repeated trials including `pi_edit`
- real-repository fixture
- task-specific routing prompt improvements
- final report comparing product success, safety, and session I/O
