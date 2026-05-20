# File lifecycle product tasks

This step extends `bench:product` beyond existing-file line edits.

## Added fixture file

The base product fixture now includes an unused module:

```text
src/legacy.js
```

This enables a delete-file lifecycle task.

## Added tasks

### `create-logger-module`

Create:

```text
src/logger.js
test/logger.test.js
```

The new module exports:

```js
formatLogLevel(level = "info")
```

and tests cover default `INFO` and override `DEBUG` behavior.

### `delete-legacy-module`

Delete the unused file:

```text
src/legacy.js
```

Existing tests must still pass.

### `rename-config-to-settings`

Rename:

```text
src/config.js -> src/settings.js
```

and update imports in:

```text
src/client.js
test/config.test.js
```

Behavior and tests should remain unchanged.

## Runner changes

`bench:product` expected files can now use `null` to mean the file should be absent:

```json
{
  "src/legacy.js": null
}
```

Lifecycle task prompts tell the model that `bash` may be used for file creation, deletion, or rename. Mode-specific edit tools are still preferred for existing-file content edits.

`pi_edit` mode now allows built-in `write` because file creation is part of lifecycle validation.

## Smoke result

Command:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-lifecycle-smoke \
  --modes pi_edit,codex_patch \
  --task create-logger-module \
  --timeout 240
```

Result:

| mode | product_success | exact | checks_pass |
| --- | ---: | ---: | ---: |
| `pi_edit` | 1/1 | 0/1 | 1/1 |
| `codex_patch` | 1/1 | 0/1 | 1/1 |

Both modes created the files and passed tests. Exact mismatches were acceptable test-name/style differences.

## Next validation

Run all lifecycle tasks across relevant modes:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-lifecycle-all \
  --modes pi_edit,tagged,hashline_range,hybrid_hashline_tagged,codex_patch \
  --task create-logger-module \
  --timeout 240
```

Then repeat for `delete-legacy-module` and `rename-config-to-settings`, or run the full product suite when time allows.
