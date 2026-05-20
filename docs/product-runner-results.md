# Product-level runner results

This records the first full product-level run. The runner creates a small JS product repository, asks the model to perform product-style changes, and grades both exact expected files and `npm test`.

## Run

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-3-all \
  --modes pi_edit,tagged,hashline_range,codex_patch \
  --timeout 240
```

Tasks:

1. `default-timeout-8000`
2. `default-retries-3`
3. `rename-request-path-param`

## Summary

| mode | success | exact | checks_pass | avg_duration_ms |
| --- | ---: | ---: | ---: | ---: |
| `pi_edit` | 1/3 | 1/3 | 3/3 | 61676 |
| `tagged` | 3/3 | 3/3 | 3/3 | 25428 |
| `hashline_range` | 2/3 | 2/3 | 3/3 | 22946 |
| `codex_patch` | 2/3 | 2/3 | 3/3 | 21099 |

The strict `success` column currently requires both exact expected files and tests passing. All modes produced test-passing repositories for all tasks.

## Interpretation

### `tagged` was best in this product-level run

`tagged` completed all 3 tasks with exact expected files and passing tests.

This reinforces the natural-use finding that `read_tagged` + `edit_tagged` is easy for the model to use correctly. It is less compact than hashline, but very robust ergonomically.

### `hashline_range` and `codex_patch` had semantically acceptable but non-exact output on one task

Both `hashline_range` and `codex_patch` failed the strict exact-file grader on `rename-request-path-param`, but `npm test` passed.

The produced test used a multiline `assert.deepEqual` object:

```js
assert.deepEqual(client.request("/health"), {
  endpoint: "/health",
  timeoutMs: 5000,
  retries: DEFAULT_RETRIES,
});
```

The expected file used an equivalent one-line assertion shape. This is a grader strictness issue, not necessarily a product failure.

### `pi_edit` also produced test-passing but non-exact output on two tasks

`pi_edit` passed tests for all tasks, but failed exact expected files on:

- `default-retries-3`
- `rename-request-path-param`

For `default-retries-3`, the model added an extra direct assertion:

```js
assert.equal(DEFAULT_RETRIES, 3);
```

For `rename-request-path-param`, it used the same multiline object assertion shape as the other modes. Both are semantically reasonable and tests pass.

## What this tells us

The product-level result is different from the synthetic exact-diff benchmark:

- When grading by exact files, `tagged` is strongest in this small run.
- When grading by tests, all modes are 3/3.
- Some “failures” are acceptable alternate implementations or formatting choices.

This means future product-level grading should separate:

1. **exact diff match** — useful for deterministic edit-tool comparison
2. **test pass** — useful for product correctness
3. **semantic/LLM judge or rubric** — useful for accepting equivalent implementations

## Next improvements

1. Add a relaxed semantic grader for product tasks, or record `product_success = checks_pass && no forbidden diff` separately from exact success.
2. Add more product tasks where tests alone are insufficient, such as config shape changes and user-visible docs.
3. Add real file lifecycle tasks:
   - create a new file
   - delete a file
   - rename/move a file
4. Add a fallback-policy run where the model can use multiple tools:
   - prefer `hashline_range`
   - fallback to `tagged` or `pi_edit` when unsuitable
5. Add total token accounting including read output, edit input, and retries.
