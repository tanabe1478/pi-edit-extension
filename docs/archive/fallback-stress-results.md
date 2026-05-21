# Fallback stress benchmark

Japanese docs: [Japanese documentation](../ja/README.md)

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
