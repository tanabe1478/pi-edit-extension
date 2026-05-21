# Policy edit path preferences

日本語: [日本語ドキュメント](../ja/README.md)

## Why

After adding relevant-file hints, the recommended policy mode often chose tagged tools even for the larger repeated route task. That is a reasonable low-friction default, but the recommended policy also needs a way to express that some tasks should use hashline for stronger anchoring/safety.

## First task using it

`update-large-route-entry` now has:

```js
relevantFiles: ["src/routes.js", "test/routes.test.js"],
preferredEditPath: "hashline"
```

## Validation

Command:

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-policy-preference-route \
  --modes replace_edit_policy \
  --task update-large-route-entry \
  --timeout 300 \
  --capture-session
```

Result:

| metric | value |
| --- | ---: |
| product_success | 1/1 |
| exact | 1/1 |
| selected path | hashline |
| session I/O | 5785 |
| session calls | 8 |

The model followed the preference and used:

- `read_hashline`
- `edit_hashline_range`

## Comparison

For the same task:

| run | selected path | session I/O |
| --- | --- | ---: |
| relevant-file hints only | tagged | 5059 |
| hashline preference | hashline | 5785 |

Hashline was slightly more expensive here, but it gives stronger line anchor validation. This supports the policy split: choose tagged by default, and opt into hashline when safety is worth the overhead.
