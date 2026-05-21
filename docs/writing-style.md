# Writing style

## 日本語要約

このリポジトリのドキュメント文体ルールです。結論を先に書き、短く、箇条書きを多めにします。

## Policy

Write docs in a concise technical-blog style.

## Rules

- Start with the conclusion.
- Prefer short sentences.
- Use tables for comparisons.
- Use bullets for conditions and caveats.
- Avoid repeating benchmark history in current docs.
- Move old one-off results to `docs/archive/`.
- Keep command examples copy-pasteable.
- Add `## 日本語要約` near the top of each doc.

## Avoid

- Long background sections.
- Repeating the same conclusion across many files.
- Saying “global replacement” when the scope is opt-in extension usage.
- Overstating cost wins over built-in `edit`.

## Preferred wording

Use:

```text
opt-in extension policy
built-in edit を外す
通常編集は tagged
安全性重視は hashline
```

Avoid:

```text
default replacement for pi core
globally replace built-in edit
antirez-style implementation
```

The project is inspired by antirez / oh-my-pi / Codex, but the tool policy and implementation are independent.
