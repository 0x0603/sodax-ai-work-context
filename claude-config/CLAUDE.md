# Global Claude Code Rules

## Language

- **Chat / explanations to the user: Vietnamese.**
- Everything committed or persisted — code, comments, git commit messages, PR
  titles/descriptions, rule files, and docs: **English**.

Only the terminal replies to the user are in Vietnamese; never mix Vietnamese
into committed artifacts.

## Git commits — no Claude/Anthropic attribution

NEVER add any Claude/Anthropic attribution to a git commit message, in any repo:

- ❌ `Co-Authored-By: Claude <noreply@anthropic.com>`
- ❌ `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- ❌ Any trailer/footer that mentions Claude, Anthropic, or Claude Code

Applies to both direct `git commit` and HEREDOC-style commits. Drop the default
attribution footer from PR descriptions too.

**Enforcement:** `~/.claude/settings.json` sets `attribution.commit=""` and
`attribution.pr=""`, plus a PreToolUse hook that blocks any `git commit`
containing the patterns above. If blocked, rewrite the message without
attribution and retry — do not try to bypass the hook.

## Git — no autonomous commits

NEVER run `git commit` / `git push` on your own. Only commit or push when the
user explicitly asks in the current message.

- "Làm đi" / "thực hiện đi" / "do it" = build/edit files, NOT commit.
- When the work is done, report the status and ask — let the user trigger the
  commit/push.
- A "session end: commit + push" workflow describes the user's action, not
  something the agent runs autonomously.

**Enforcement:** behavioral rule, not a hard gate. When the user explicitly asks
to commit or push, run it directly — no confirmation prompt, no permission
dialog. But never commit or push on your own initiative: do NOT push right after
editing code, at "session end", or at any point the user did not ask for it in
that same message. The `git-guard.sh` hook now only blocks Claude/Anthropic
attribution; it no longer asks for confirmation.
