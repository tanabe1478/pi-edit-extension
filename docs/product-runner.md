# Product-level runner

Japanese docs: [Japanese documentation](ja/README.md)

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

The runner now reports two success levels:

1. `product_success` / `success`
   - `pi -p` exits successfully
   - `npm test` passes in the temporary repository
2. `exact`
   - final files exactly match the expected files for the task

`exact` is kept as a strict deterministic comparison signal, but it is no longer the main success criterion. Product-level success is based on passing checks, because equivalent implementations or formatting can differ from the expected fixture while still being correct.

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
