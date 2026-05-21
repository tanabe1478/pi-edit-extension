# Session tool I/O accounting

`bench:product` can now optionally capture pi session JSONL and summarize all tool calls, including built-in tools.

## Usage

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-session-io-smoke \
  --modes pi_edit,replace_edit_tagged \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

When `--capture-session` is enabled, each run uses a local session directory:

```text
runs/<mode>/<task>/.pi-sessions
```

The runner parses the newest session JSONL and records:

```json
"sessionToolIo": {
  "toolCalls": 0,
  "readCalls": 0,
  "editCalls": 0,
  "toolInputChars": 0,
  "toolResultChars": 0,
  "totalToolIoChars": 0,
  "byTool": {}
}
```

Mode summary also includes:

```json
"sessionToolCalls": 0,
"sessionToolInputChars": 0,
"sessionToolResultChars": 0,
"sessionTotalToolIoChars": 0,
"avgSessionToolIoChars": 0,
"avgSessionToolCalls": 0
```

## Smoke result

Command:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-session-io-smoke \
  --modes pi_edit,replace_edit_tagged \
  --task default-timeout-8000 \
  --timeout 300 \
  --capture-session
```

Result:

| mode | product | exact | extension I/O | session I/O | session calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| `pi_edit` | 1/1 | 1/1 | 0 | 7955 | 16 |
| `replace_edit_tagged` | 1/1 | 1/1 | 1587 | 6374 | 17 |

This confirms that built-in `pi_edit` can be compared through session JSONL even though extension metrics remain zero for built-in tools.

## Caveats

- Session I/O counts tool call argument JSON chars plus tool result text chars.
- It does not count full model context, system prompts, or hidden provider protocol overhead.
- It includes all enabled tool calls, including `bash` test runs and exploratory built-in `read` calls.
- Because sessions are captured locally per run, they should not leak into the user's normal pi session history.

## Why this matters

Extension metrics are useful for replacement-tool internals, but they cannot measure built-in `read`/`edit`/`write`/`bash`. Session parsing gives a more apples-to-apples product-level tool I/O signal.
