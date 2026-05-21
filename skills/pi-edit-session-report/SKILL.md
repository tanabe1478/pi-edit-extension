---
name: pi-edit-session-report
description: Analyze pi session JSONL logs and generate an improvement report for this pi edit extension repository. Use when asked to review pi sessions, session logs, tool usage, or generate improvement/action reports for pi-tagged-edit-extension.
---

# Pi Edit Session Report

Use this skill to analyze pi session JSONL logs and write a Markdown improvement report into the `pi-tagged-edit-extension` repository.

## What it does

The helper script parses pi session JSONL files and reports:

- tool call counts and tool I/O character estimates
- built-in `edit` usage that should have used replacement tools
- tagged/hashline/hashline fallback usage
- tool errors and rejected edits
- broad read patterns that increase session I/O
- concrete improvement ideas for this repository

## Usage

From the repository root:

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session ~/.pi/agent/sessions \
  --repo .
```

Useful options:

```bash
# Analyze one session file or directory
--session <path>

# Repository root where the report should be written
--repo <path>

# Explicit output path
--out docs/session-improvement-reports/my-report.md

# Limit newest session files when --session is a directory
--limit 20
```

Default output path:

```text
docs/session-improvement-reports/session-improvement-<timestamp>.md
```

## Recommended workflow

1. Identify the relevant session directory or JSONL file.
2. Run the script from the repository root.
3. Read the generated report.
4. Summarize the top findings for the user.
5. If the user asked to persist changes, commit the report.

## Notes

- Session I/O is approximate: JSON argument char length plus tool result text char length.
- The report is intended to guide improvements, not provide exact billing/token numbers.
- Prefer analyzing sessions captured with `bench:product --capture-session` when comparing built-in and replacement tools.
