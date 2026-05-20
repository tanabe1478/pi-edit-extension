# Remaining validation plan

This document breaks the remaining work into small, understandable implementation/validation steps. Each step should be committed separately with its own result notes when applicable.

## Goal

Move from “promising synthetic benchmark” toward “credible replacement/fallback strategy for product use”.

## Step 1: total tool I/O accounting

Current comparisons often focus on edit payload size, but natural/product runs include read output, retries, and extra verification reads. Add aggregate accounting for:

- read result chars
- edit input chars
- total tool I/O chars
- tool call count
- read call count
- edit call count

Apply this first to `bench:product`, then reuse the helper in natural runs if useful.

Why first:

- `hashline_range` has compact edits but may read more.
- `tagged` may be naturally robust but less compact per edit.
- Product-level decisions need total cost, not edit payload only.

## Step 2: file lifecycle product tasks

Add product tasks that cover operations hashline range does not directly solve:

- create a new file
- delete a file
- rename/move file
- update imports after rename

This will show where fallback tools are required.

## Step 3: all-tools natural/product mode

Add a mode where the model can choose among multiple tools naturally:

- built-in `read` / `edit`
- `read_hashline` / `edit_hashline_range`
- `read_tagged` / `edit_tagged`
- `edit_codex_patch`

Measure tool choice, success, and cost. This is closer to real operation than mode-isolated runs.

## Step 4: larger product task pack

Expand beyond the tiny JS fixture:

- config file edits
- docs edits
- repeated boilerplate
- multi-file implementation + tests
- formatter-sensitive changes

## Step 5: repeated trials

Run selected product tasks with multiple trials per mode to measure variance:

- success rate
- exact rate
- tool choice stability
- total tool I/O distribution
- duration distribution

## Step 6: failure classification

Add automatic failure categories:

- no edit
- wrong line/range
- extra blank line
- exact mismatch only
- tests fail
- tool rejection unrecovered
- timeout
- syntax/tool misuse

## Step 7: upstream oh-my-pi actual comparison

Once oh-my-pi model access is configured, run direct upstream actual comparisons.
