# Larger existing-file product tasks

## 日本語要約

より大きい existing-file product edit tasks を追加・検証した記録です。


This step adds two larger existing-file product tasks to `bench:product`. These are closer to normal product edits than the tiny smoke tasks because they touch validation logic, exported config shape, client behavior, and tests.

## Added tasks

### `validate-timeout-positive`

Requirement:

- `parseConfig` throws `RangeError("timeoutMs must be positive")` when `timeoutMs <= 0`
- defaults remain valid
- explicit valid overrides keep working
- tests cover zero and negative timeout values

Files involved:

- `src/config.js`
- `test/config.test.js`

### `add-base-url-config`

Requirement:

- add `DEFAULT_BASE_URL = "https://api.example.com"`
- `parseConfig` returns `baseUrl`
- `createClient` exposes `baseUrl`
- `request(path)` returns `url` built from `baseUrl + path`
- timeout/retry behavior remains unchanged
- tests cover defaults, overrides, and client request URL

Files involved:

- `src/config.js`
- `src/client.js`
- `test/config.test.js`

## Validation commands

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-larger-validate-timeout-positive \
  --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task validate-timeout-positive \
  --timeout 300

npm run bench:product -- \
  --out /tmp/pi-edit-product-larger-add-base-url-config \
  --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task add-base-url-config \
  --timeout 300
```

## Results

### Product success

| task | pi_edit | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | ---: | ---: | ---: | ---: |
| `validate-timeout-positive` | 1/1 | 1/1 | 1/1 | 1/1 |
| `add-base-url-config` | 1/1 | 1/1 | 1/1 | 1/1 |

All modes passed tests for both larger tasks.

### Exact match

| task | pi_edit | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | ---: | ---: | ---: | ---: |
| `validate-timeout-positive` | 0/1 | 0/1 | 0/1 | 0/1 |
| `add-base-url-config` | 0/1 | 0/1 | 0/1 | 0/1 |

Exact match was 0 for all modes. The tasks allow multiple product-correct implementations and test styles, so product success is the primary signal here.

### Extension-observed tool I/O chars

| task | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | ---: | ---: | ---: |
| `validate-timeout-positive` | 1988 | 2223 | 1888 |
| `add-base-url-config` | 3149 | 5284 | 4188 |

`pi_edit` is omitted here because built-in tools are not instrumented by extension metrics.

## Observations

- All edit replacement modes remained product-correct on larger existing-file edits.
- `add-base-url-config` caused noticeably higher tool I/O for hashline modes because the model performed wider reads and verification reads.
- `replace_edit_hybrid` did not need tagged fallback in these runs; it used hashline tools.
- Exact matching becomes less useful as product tasks allow valid implementation/test style variation.

## Implication

The next stronger signal should come from repeated trials and broader task variety, not exact-match-only judging.
