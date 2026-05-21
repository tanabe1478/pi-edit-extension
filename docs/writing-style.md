# Writing style

Japanese docs: [Japanese documentation](ja/README.md)

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
- Keep English docs as the primary source.
- Add a link to `docs/ja/README.md` near the top of English docs.

## Avoid

- Long background sections.
- Repeating the same conclusion across many files.
- Saying “global replacement” when the scope is opt-in extension usage.
- Overstating cost wins over built-in `edit`.

## Preferred wording

Use:

```text
opt-in extension policy
omit built-in edit
use tagged for normal edits
use hashline for safety-sensitive edits
```

Avoid:

```text
default replacement for pi core
globally replace built-in edit
antirez-style implementation
```

The project is inspired by antirez / oh-my-pi / Codex, but the tool policy and implementation are independent.
