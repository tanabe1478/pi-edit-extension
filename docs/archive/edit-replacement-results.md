# Edit replacement product results

Japanese docs: [Japanese documentation](../ja/README.md)

## Command

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-replace-edit-all \
  --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --timeout 300
```

The suite contains 6 product tasks:

- `default-timeout-8000`
- `default-retries-3`
- `rename-request-path-param`
- `create-logger-module`
- `delete-legacy-module`
- `rename-config-to-settings`

## Summary

| mode | product_success | exact | checks_pass | avg_duration_ms | extension tool calls | extension tool I/O chars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `pi_edit` | 6/6 | 4/6 | 6/6 | 19932 | 0 | 0 |
| `replace_edit_tagged` | 6/6 | 5/6 | 6/6 | 27746 | 21 | 7321 |
| `replace_edit_hashline` | 6/6 | 4/6 | 6/6 | 21233 | 24 | 7523 |
| `replace_edit_hybrid` | 6/6 | 3/6 | 6/6 | 21039 | 23 | 7232 |

All edit-replacement modes completed all tasks with tests passing.

## Interpretation

### Product correctness

For this small product suite, replacing built-in `edit` with tagged/hashline/hybrid edit tools did not reduce product success:

```text
pi_edit:                6/6
replace_edit_tagged:    6/6
replace_edit_hashline:  6/6
replace_edit_hybrid:    6/6
```

Exact match varies mostly because product-correct edits may choose different but valid test names or assertions. Product success is the more important signal here.

### Lifecycle scope

Create/delete/rename tasks succeeded because `write` and `bash` remained available. This matches the intended product scope: only `edit` is replaced.

### Tool I/O caveat

`pi_edit` appears as zero extension tool I/O because built-in tools are not instrumented by this extension. The replacement modes show only extension-observed read/edit payloads, not full model context or built-in `bash`/`write` payloads.

### Tagged vs hashline in this run

`replace_edit_tagged` had the best exact score in this single run:

```text
5/6 exact
```

`replace_edit_hashline` and `replace_edit_hybrid` both succeeded product-wise but had more exact mismatches. They also tended to read more files for context. The total extension-observed I/O was close across replacement modes:

```text
replace_edit_tagged:    7321 chars
replace_edit_hashline:  7523 chars
replace_edit_hybrid:    7232 chars
```

## Current conclusion

For the intended scope — replacing only built-in `edit` while keeping `read`, `write`, and `bash` — the candidate tools are viable on this small product suite.

The strongest next validation is not more lifecycle coverage, but larger/more realistic existing-file edit tasks and repeated trials:

- larger product task pack
- multi-file edits
- repeated trials per mode
- built-in tool I/O instrumentation if possible
