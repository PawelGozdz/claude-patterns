# Searching Files

> Applies to every agent, including Explore subagents spawned with a Bash-first instruction.
> Background: Claude Code ≥ 2.1.259 (2026-09-02) asks the user for permission when a
> recursive read walks a directory holding a file covered by a `Read(...)` deny rule.
> Every repo here has `.env` in its root and `Read(.env)` in `.claude/settings.json`, and
> deny rules apply even in `bypassPermissions` mode — so one `grep -r … .` stalls the whole
> flow with a prompt the user has to click every few seconds.

## Rules

- **Use the Grep tool** for code searches. It applies deny rules per file, silently.
- **Never** run `grep -r`, `rg`, `git grep` or `find . | xargs grep` on `.`, on `*`, on the
  repo root, or with no path at all (`rg PATTERN` and `grep -r PATTERN` default to `.`).
- If Bash is unavoidable, **scope it to subdirectories that contain no `.env`**:

  ```bash
  grep -rn PATTERN src/ test/ docs/      # OK
  grep -rn PATTERN .                     # prompts the user — blocked by hook
  rg PATTERN                             # same — no path means "."
  git grep -l PATTERN                    # same — walks the root
  git grep -l PATTERN -- src             # OK
  ```

- `--exclude=.env` / `--exclude-dir` do **not** help (verified 2026-09-03): the check fires
  on the directory being walked, not on the file list.
- When you spawn a subagent, pass this rule in its prompt. Subagents don't inherit your
  conversation, only the project files.

## Enforcement

`hooks/block-root-grep.js` (registered as a `PreToolUse` hook for `Bash` in
`~/.claude/settings.json`) denies such commands with this same guidance instead of prompting
the user. The hook is the safety net; following the rules above saves the wasted turn.
Do **not** work around it by removing the `Read(.env)` deny rule — it is the thing
protecting secrets from being read into context.
