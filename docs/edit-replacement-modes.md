# Edit replacement product modes

## 日本語要約

bench:product で使う edit 置き換え mode の定義です。built-in edit だけを外し、read/write/bash は残す前提を説明します。


The intended replacement scope is pi's built-in `edit` tool only.

Built-in tools that are not being replaced can remain available:

- `read`
- `write`
- `bash`

This means file lifecycle operations are still handled by existing mechanisms, while existing-file content edits are routed through candidate replacement tools.

## Modes

`bench:product` now includes these explicit edit-replacement modes:

### `replace_edit_tagged`

Available tools:

```text
read, write, bash, read_tagged, edit_tagged
```

Policy:

- use `read_tagged` + `edit_tagged` for existing-file content edits
- use `write` / `bash` for create/delete/rename/test operations
- do not use built-in `edit`

### `replace_edit_hashline`

Available tools:

```text
read, write, bash, read_hashline, edit_hashline_range
```

Policy:

- use `read_hashline` + `edit_hashline_range` for existing-file content edits
- use `write` / `bash` for create/delete/rename/test operations
- do not use built-in `edit`

### `replace_edit_hybrid`

Available tools:

```text
read, write, bash, read_hashline, edit_hashline_range, read_tagged, edit_tagged
```

Policy:

- prefer `read_hashline` + `edit_hashline_range`
- fall back to `read_tagged` + `edit_tagged` if anchors are inconvenient or rejected
- use `write` / `bash` for lifecycle operations
- do not use built-in `edit`

## Why separate these from earlier modes?

Earlier mode-isolated runs intentionally restricted tools to isolate each edit mechanism. That is useful for mechanism comparison, but it can overstate lifecycle limitations because `write` was not always available.

The edit-replacement modes match the actual product intent more closely:

```text
baseline: read + edit + write + bash
candidate: read + replacement edit tools + write + bash
```

## Example command

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-replace-edit-smoke \
  --modes pi_edit,replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task rename-config-to-settings \
  --timeout 300
```
