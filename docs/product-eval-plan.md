# Product-level and natural-use evaluation plan

Japanese docs: [Japanese documentation](ja/product-eval-plan.md)

## What is still missing

### 1. Natural LLM tool use

Current `bench:actual` prompts often include the exact payload to apply. That answers:

> If the model has the right payload, can the tool apply it?

It does not fully answer:

> Will the model naturally choose the right read/edit workflow and construct the payload correctly?

A product-level eval should give only the task intent, then let the model inspect files and choose the edit syntax.

Examples of things this can reveal:

- model forgets to read before editing
- model drops `:strict` tags from hashline anchors
- model uses a broad destructive range and gets rejected
- model retries correctly after a strict-anchor rejection
- model falls back to `pi_edit` when hashline is unsuitable
- model makes syntax errors in patch payloads

### 2. Real repository tasks

Synthetic fixtures are controlled and reproducible, but product behavior needs real codebases:

- TypeScript application code
- Python files
- Rust files
- Markdown docs
- JSON/YAML/TOML config
- repeated boilerplate
- generated-ish files
- large files
- nested directories and multi-file edits

The next benchmark layer should create temporary checkouts of selected OSS repos or local fixture repos, apply fixed tasks, and compare final `git diff` to an expected patch.

### 3. Multi-file and file lifecycle edits

Current hashline tools focus on existing-file line edits. Product-level evals should include:

- add file
- delete file
- rename/move file
- edit multiple files consistently
- update imports after rename
- edit tests plus implementation

For these, `codex_patch` or `pi_edit` may remain a better fallback unless hashline grows explicit file lifecycle operations.

### 4. Retry and fallback policy

A practical replacement is probably not “hashline only”. A safer policy is:

1. Use adaptive hashline for line-oriented existing-file edits.
2. If strict anchors are required, re-read and retry once.
3. If the task is partial-substring, file creation/deletion, rename, or repeated rejection, fall back to `pi_edit` or `codex_patch`.
4. Record fallback count and reason.

Product-level metrics should include:

- first-try success
- success after retry
- fallback rate
- false accept count
- reject count by reason
- average read payload
- average edit payload
- wall time
- final diff correctness

## Inspiration from pi-skill-eval-extension

`pi-skill-eval-extension` uses fixed scenario files, fresh blank-slate `pi -p` executions, self-reports, and ledgers. The same pattern is useful here:

- keep tasks fixed before iterating
- run each task in a fresh temp worktree
- compare against expected output or expected diff
- collect self-reported retries / unclear points
- append results to a ledger
- include hold-out tasks not used during iteration

For edit-tool evals, the grader can be stronger than self-report: final file content or `git diff` must match exactly.

## New natural-use runner

This repository includes an initial natural-use runner:

```bash
npm run bench:natural -- --out /tmp/pi-edit-natural --modes pi_edit,tagged,hashline_legacy,hashline,codex_patch,crc --timeout 180
```

Unlike `bench:actual`, it does **not** hand the model a precomputed tool payload. It gives:

- the scenario name
- target line range
- desired replacement text or deletion intent
- allowed tools for the mode

The model must inspect `fixture.ts` and construct the appropriate tool call itself.

This is still synthetic, but it is closer to product behavior than the payload-injected harness. The next step is to add real-repo task packs with expected diffs.

## Proposed real-repo task pack format

A future `bench/product-plan.mjs` can emit tasks like:

```json
{
  "id": "ts-add-option-default",
  "repo": "fixtures/repos/sample-ts",
  "setup": ["npm install"],
  "prompt": "Add a timeoutMs option with default 5000 to the client config parser.",
  "allowedModes": ["pi_edit", "hashline", "codex_patch"],
  "expectedDiff": "diff --git ...",
  "checks": ["npm test"]
}
```

Suggested first task categories:

1. **Single-file line-oriented edits** where hashline should excel.
2. **Repeated boilerplate edits** to test strict anchors.
3. **Large deletion/replacement** to test token scaling.
4. **Small inline edits** where `pi_edit` may be more natural.
5. **Multi-file edits** where fallback policy matters.
6. **Create/delete/rename file** where hashline is not yet the right primitive.
7. **Formatter-sensitive config edits**.

## Decision criteria for replacing `pi_edit`

A reasonable replacement claim would require:

- no known clean-task cases where `pi_edit` succeeds and adaptive hashline incorrectly fails
- no false accepts in failure/stress tests
- high natural-use success rate without precomputed payloads
- low retry/fallback rate
- clear diagnostics that let the model recover when rejection is intentional
- real-repo task success comparable to or better than `pi_edit`

Current status:

- clean synthetic actual run: `pi_edit` 43/43, adaptive `hashline` 43/43
- failure suite: adaptive `hashline` rejects the legacy same-line collision false-accept case
- missing: broad natural-use and real-repo evals
