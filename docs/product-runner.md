# Product-level runner

`bench:product` is the first product-level validation layer. It is inspired by the agent-invocation pattern from `pi-skill-eval-extension`: each task runs in a fresh blank-slate `pi -p` process, with a fixed prompt and isolated working directory.

Unlike the synthetic line benchmark, this runner creates a small JavaScript repository with source files, tests, and a package script. The model receives a product-style task, not a precomputed edit payload.

## Command

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product \
  --modes pi_edit,tagged,hashline_range,codex_patch \
  --timeout 240
```

Useful smoke command:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-smoke \
  --modes tagged,hashline_range \
  --limit 1 \
  --timeout 240
```

## Current task pack

The runner creates a small JS product repository:

```text
package.json
src/config.js
src/client.js
test/config.test.js
```

Current tasks:

1. Change default timeout from 5000ms to 8000ms and update tests.
2. Change default retry count from 2 to 3 and update tests.
3. Rename the `request(path)` parameter/result field to `endpoint` and update tests.

## Grading

A run succeeds only if all are true:

1. `pi -p` exits successfully.
2. Final files exactly match the expected files for the task.
3. `npm test` passes in the temporary repository.

The exact-file check is intentionally stricter than tests alone. It catches cases where the model produces a semantically acceptable but different implementation, which is useful while comparing edit tools.

## Why this exists

The previous natural-use fixture still edited a single synthetic `fixture.ts` file. `bench:product` adds missing product-level signals:

- multiple files
- implementation + test updates
- real test command
- product-style prompt
- exact final diff grading

This is still a small local fixture, not a full OSS repository benchmark. It is the next step before larger real-repo task packs.

## Next extensions

- Add more task packs with TypeScript, JSON/YAML config, Markdown docs, and Rust/Python files.
- Add file creation/deletion/rename tasks.
- Add fallback-policy runs where the model can choose multiple edit tools.
- Persist a machine-readable ledger across runs.
