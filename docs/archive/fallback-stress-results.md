# Fallback stress benchmark

## 日本語要約

hashline reject 後に tagged fallback が機械的に成立するかを確認した deterministic stress 結果です。


This benchmark validates the intended fallback policy mechanically:

1. Try adaptive `hashline_range` first.
2. If it rejects for safety, fall back to `tagged` using current line tags.
3. Confirm the final edit succeeds.

This is not a natural LLM-use benchmark. It isolates fallback mechanics so we can verify the policy before asking the model to learn it naturally.

## Command

```bash
npm run bench:fallback
```

## Cases

### 1. Stale strict hashline rejects then tagged succeeds

Setup:

- read-time line: `collision candidate 8`
- edit-time line: `collision candidate 35`
- both share the same 2-character hashline hash (`uz`)
- strict hashline anchor includes the old line's extra checksum

Expected:

- `hashline_range` rejects the stale strict anchor
- `tagged` fallback reads/uses the current tag and applies the edit

### 2. Plain destructive hashline rejects then tagged succeeds

Setup:

- delete 25 lines
- first attempt uses plain `LINEhh` range endpoints

Expected:

- adaptive `hashline_range` rejects because destructive/wide ranges require strict endpoints
- `tagged` fallback applies the deletion with per-line tags

## Initial result

| case | first | fallback | final |
| --- | --- | --- | --- |
| stale strict hashline rejects then tagged succeeds | reject | apply | success |
| plain destructive hashline rejects then tagged succeeds | reject | apply | success |

## Interpretation

The fallback path works mechanically. This complements the product-level hybrid run:

- Product-level hybrid run showed that exposing `tagged` fallback does not confuse the model when fallback is unnecessary.
- This deterministic fallback stress run shows that, when adaptive hashline rejects for safety, tagged can complete the edit.

The remaining missing validation is a **natural fallback run** where the model itself observes a rejection and chooses the tagged fallback. That requires a harness that can introduce drift between read and edit or otherwise force the first hashline attempt to fail during an agent session.
