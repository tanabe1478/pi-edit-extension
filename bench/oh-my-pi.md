# oh-my-pi parallel benchmark notes

Goal: compare this extension's modes against upstream `can1357/oh-my-pi` hashline on the same task plan.

## Inputs

Generate a neutral benchmark plan:

```bash
node bench/plan.mjs /tmp/pi-edit-plan.json
```

Or generate the full parallel run directory, task fixtures, prompts, summary, and oh-my-pi checkout metadata:

```bash
npm run bench:parallel -- --out /tmp/pi-edit-parallel
```

Use `--install`, `--build-native`, and `--smoke` if you want the runner to prepare oh-my-pi and verify that its CLI starts:

```bash
npm run bench:parallel -- \
  --out /tmp/pi-edit-parallel \
  --install \
  --build-native \
  --smoke
```

The setup step is recorded in `oh-my-pi.json`. If the native build takes too long, rerun the same command; Cargo/Bun caches make the second run faster.

The JSON contains:

- fixture source text
- scenario ranges and expected replacement text
- equivalent edit payloads for:
  - `old_new`
  - `tagged`
  - `hashline`
  - `crc`

## Running this extension

Use `PI_TAGGED_EDIT_METRICS` to capture JSONL:

```bash
export PI_TAGGED_EDIT_METRICS=/tmp/pi-edit-extension.jsonl
pi -e ./src/index.ts
```

Ask the model to solve each scenario using one specified mode only.

## Running oh-my-pi in parallel

The parallel runner clones upstream by default to `/tmp/oh-my-pi-bench` unless `OH_MY_PI_DIR` or `--oh-my-pi-dir` is provided.

```bash
npm run bench:parallel -- --oh-my-pi-dir /tmp/oh-my-pi-bench --out /tmp/pi-edit-parallel
```

It verifies that the upstream docs and hashline implementation are present. Then run oh-my-pi/omp against the same fixture and scenario prompts in `/tmp/pi-edit-parallel/tasks/*/oh_my_pi.prompt.md`, forcing its default hashline edit mode.

## Reporting

After generating or running a parallel benchmark directory:

```bash
npm run bench:report -- --dir /tmp/pi-edit-parallel --out /tmp/pi-edit-parallel/report.md
```

This emits both Markdown and JSON summaries.

## Metrics to compare

Primary:

- task success rate
- edit-call output tokens/chars
- retry count
- stale-anchor rejection rate

Secondary:

- read output chars/tokens
- wall time
- mismatch diagnostic usefulness
- number of edit ops
- whether the model chooses narrow `+`/`-` ops instead of broad `=` ranges

## Important fairness notes

- This extension now vendors oh-my-pi's curated bigram table but uses CRC32 for Node portability. oh-my-pi uses Bun's `xxHash32`.
- Payload language is intentionally aligned (`@@ PATH`, `+`, `<`, `-`, `=`, `~payload`).
- oh-my-pi has additional production features not yet mirrored here: stale-anchor recovery via read cache, LSP writethrough, duplicate-boundary absorption, streaming preview, and richer model prompts.
