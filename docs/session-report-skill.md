# Session report skill

## 日本語要約

pi session log からこのリポジトリ向けの改善レポートを生成する skill の使い方です。


This repository includes a project skill for generating improvement reports from pi session JSONL logs:

```text
skills/pi-edit-session-report
```

## Skill purpose

Use the skill when asked to analyze pi sessions or generate improvement reports for this edit extension.

It reports:

- tool call counts
- approximate session tool I/O chars
- built-in `edit` usage
- replacement edit usage
- tagged/hashline routing
- broad read patterns
- tool errors / hashline rejections
- concrete improvement recommendations

## Direct script usage

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session <session-file-or-directory> \
  --repo .
```

Default output:

```text
docs/session-improvement-reports/session-improvement-<timestamp>.md
```

You can also write to an explicit path:

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session /tmp/some-run/.pi-sessions \
  --repo . \
  --out docs/session-improvement-reports/example.md
```

## Smoke validation

Command:

```bash
node skills/pi-edit-session-report/scripts/session-report.mjs \
  --session /tmp/pi-edit-product-policy-hints-smoke/runs/replace_edit_policy/default-timeout-8000/.pi-sessions \
  --repo . \
  --out /tmp/pi-edit-session-skill-smoke.md
```

The generated report included:

| metric | value |
| --- | ---: |
| sessions | 1 |
| tool calls | 5 |
| total tool I/O chars | 2779 |
| built-in edit calls | 0 |
| replacement edit calls | 2 |
| tool errors | 0 |
| broad reads >2500 chars | 0 |

## Notes

The script is intentionally dependency-free and approximate. It is meant to generate actionable improvement reports from session logs, not exact provider billing data.
