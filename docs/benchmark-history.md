# Benchmark history and current findings

This document summarizes the edit-tool comparison work so far: why the modes exist, what was implemented, what we measured, and what to test next.

## Background

The starting question was whether a shorter edit representation can preserve the safety properties of `oldText -> newText` while reducing model output tokens. The extension now compares several approaches:

| mode | idea | safety mechanism | token profile |
| --- | --- | --- | --- |
| `pi_edit` | pi built-in edit | exact `oldText` match | expensive for large edits |
| `tagged` | antirez-style line tags | line number + CRC-derived tag | compact, strong per-line CAS |
| `codex_patch` | Codex `apply_patch`-style context diff | old/context lines found in file | readable and safe, often verbose |
| `hashline_legacy` | oh-my-pi-style compact anchors | line number + 2-letter hash | most compact, collision risk |
| `hashline` | adaptive strict hashline | `LINEhh`, plus deterministic `:tag` when risky | compact with stronger checks |
| `crc` | whole-file CRC + line range | whole-file CAS | compact payload, but fragile/retry-prone |

## External implementations inspected

### oh-my-pi hashline

The upstream oh-my-pi repository was cloned to:

```text
/tmp/oh-my-pi-bench
```

Relevant findings:

- oh-my-pi explicitly uses 2-character hashline anchors.
- The hashline shape is `LINEhh|TEXT`.
- The 2-letter hash is mapped through a curated bigram table.
- This repository vendors that bigram table and implements Node-compatible `xxHash32` matching `Bun.hash.xxHash32(input, 0)` reference values.

### OpenAI Codex apply_patch

The upstream Codex repository was cloned to:

```text
/tmp/openai-codex-bench
```

Relevant files inspected:

```text
codex-rs/apply-patch/src/parser.rs
codex-rs/apply-patch/src/lib.rs
codex-rs/apply-patch/src/seek_sequence.rs
codex-rs/apply-patch/apply_patch_tool_instructions.md
```

Codex `apply_patch` behavior, as implemented here:

1. Parse `*** Begin Patch` / file operation / `@@` hunk / `*** End Patch` envelope.
2. For update hunks, gather old lines and new lines.
3. If a hunk has `@@ context`, seek that context first.
4. Seek the old/context sequence with decreasing strictness:
   - exact match
   - trailing-whitespace-insensitive match
   - trim-insensitive match
   - Unicode punctuation normalization
5. Apply replacements in descending order.
6. Reject if expected lines cannot be found.

The Rust binary build was attempted, but dependency compilation was killed by the host during `cargo run`. The implementation was therefore ported from the inspected source rather than validated by running the binary end-to-end.

## Hashline safety evolution

### Legacy hashline

`hashline_legacy` preserves the original compact shape:

```text
36cx|  const repeated = normalize(input.shared ?? defaultValue);
```

It is important to be precise about what this protects against. `LINEhh` is not just a 2-character hash: it is a line number plus a 2-character hash. That means many ordinary collisions are already mitigated.

For example, if two different lines share the same 2-letter hash:

```text
36cx|...
80cx|...
```

then the line number disambiguates them. Likewise, if line 36 changes and its new content hashes to something other than `cx`, the stale anchor is rejected.

The unresolved risk is narrower: **same-line stale collision**.

```text
read time:
1uz|collision candidate 8

edit time:
1uz|collision candidate 35
```

Here, both pieces of information available to legacy hashline still match:

- line number: `1`
- 2-character hash: `uz`

But the full line content changed. With only `LINEhh`, the tool has no remaining information with which to distinguish this from a valid edit. This is not a parser bug; it is an information-limit of the compact representation.

A concrete collision used in tests:

```text
"collision candidate 8"  -> hash `uz`
"collision candidate 35" -> hash `uz`
```

Ways to detect this class of stale edit require adding information somewhere:

- longer hash
- extra checksum
- read-snapshot validation
- file version / mtime / whole-file hash
- carrying old content, as `oldText/newText` or Codex patch does

### Adaptive strict hashline

`hashline` keeps compact anchors for safe-looking lines, but emits strict anchors deterministically for high-risk lines:

```text
36cx:R0lp|  const repeated = normalize(input.shared ?? defaultValue);
```

The strictness decision is deterministic, not left to the LLM.

A line becomes strict if any of these OR conditions is true:

- low-information line
  - empty line
  - `{` / `}`
  - punctuation-only line
  - very short line
- repeated identical line text in the file
- 2-character hash collision in the file

Edit-time range rules are also deterministic:

- delete range OR wide range edit requires strict endpoints
- current threshold: range length >= 20 lines

This preserves token efficiency for normal lines while hardening known risk areas.

The goal is not to make hashline identical to `oldText/newText`; the goal is to keep the compact `LINEhh` form for low-risk lines and add information only where the deterministic risk model says the compact form is weak.

## Current broad benchmark suite

The benchmark suite was expanded from 12 to 43 tasks. It now includes:

- narrow one-line replacements
- early / late / EOF-adjacent edits
- small and medium block replacements
- 10-, 15-, 30-, and 100-line replacements
- 4-, 10-, 19-, 21-, 40-, and 100-line deletions
- repeated-line and repeated-adjacent edits
- insertion-shaped replacements
- strict-threshold boundary cases

Run directory:

```text
/tmp/pi-edit-actual-43-all
```

Report:

```text
/tmp/pi-edit-actual-43-all/report.md
```

### Payload-size result

| mode | chars | tokens_est | saved_vs_old_new |
| --- | ---: | ---: | ---: |
| `pi_edit` | 42932 | 10749 | 0% |
| `tagged` | 9919 | 2497 | 76.9% |
| `codex_patch` | 60608 | 15167 | -41.2% |
| `hashline_legacy` | 3882 | 987 | 91.0% |
| `hashline` | 4167 | 1057 | 90.3% |
| `crc` | 5756 | 1454 | 86.6% |

### Actual harness result

All modes completed all 43 tasks successfully.

| mode | success | total | avg_duration_ms |
| --- | ---: | ---: | ---: |
| `pi_edit` | 43 | 43 | 13088 |
| `tagged` | 43 | 43 | 9650 |
| `codex_patch` | 43 | 43 | 12854 |
| `hashline_legacy` | 43 | 43 | 9728 |
| `hashline` | 43 | 43 | 11216 |
| `crc` | 43 | 43 | 23010 |

## Interpretation

Current clean-task conclusions:

- `hashline_legacy` is the most compact mode.
- `hashline` adds a small payload overhead for deterministic safety hardening: 3882 -> 4167 chars in the 43-task suite.
- `tagged` is less compact than hashline, but remains simple and robust.
- `codex_patch` is readable and safe, but usually payload-heavy because it carries old/context text.
- `crc` has compact edit payloads, but actual runs were slow because the model often re-read large file ranges before applying the CRC edit.
- Clean tasks do not expose the most important differences, because all modes succeed.

## Failure-inducing tasks

Clean tasks do not expose the most important safety differences, so the repository includes a separate deterministic failure/stress suite:

```bash
npm run bench:failure
```

The suite intentionally uses stale, colliding, or drifted payloads. Some modes are expected to reject by design, and `hashline_legacy` is expected to demonstrate a false accept in the collision case.

Current cases:

1. **same-line 2-char hash collision**
   - stale anchor from old text
   - current line has different text with the same `LINEhh`
   - expected: `hashline_legacy` can false-accept; strict hashline rejects

2. **destructive range without strict endpoints**
   - delete or wide edit with plain `LINEhh` endpoints
   - expected: legacy applies; adaptive strict rejects

3. **stale exact text**
   - current file no longer contains `oldText`
   - expected: `pi_edit`, `tagged`, `codex_patch`, `crc`, strict hashline reject

4. **ambiguous recovery**
   - stale snapshot recovery finds changed old segment in multiple locations
   - expected: recovery rejects ambiguity

5. **whole-file CRC invalidation**
   - unrelated file change after read
   - expected: `crc` rejects even if target lines are unchanged

6. **Codex fuzzy matching boundary**
   - trailing-whitespace-only and trim-only drift should still apply
   - semantic drift should reject

These run separately from the clean-task suite because expected outcomes differ by mode: rejection can be success, and a legacy false accept is intentionally recorded as the risk being demonstrated.

Initial result summary:

| case | expected difference observed |
| --- | --- |
| same-line 2-char hash collision | `hashline_legacy` false-accepts; `hashline` strict rejects; `pi_edit`, `tagged`, `codex_patch`, and `crc` reject |
| destructive range without strict endpoints | legacy hashline applies; adaptive hashline rejects until strict endpoints are used |
| whole-file CRC invalidation | `crc` rejects after unrelated file change |
| Codex fuzzy whitespace boundary | trim/trailing-whitespace drift applies; semantic drift rejects |
