#!/usr/bin/env bash
# PreToolUse(Bash) hook. For `git commit` / `git push`:
#   - deny if the command carries Claude/Anthropic attribution
# Otherwise allow without prompting. "No autonomous commit/push" is a behavioral
# rule (see CLAUDE.md), not enforced here: when the user explicitly asks to push,
# it runs directly with no confirmation prompt.
# Any other command is allowed (exit 0 with no output).
CMD="$(jq -r '.tool_input.command // ""')"

echo "$CMD" | grep -qE 'git[[:space:]]+(commit|push)' || exit 0

if echo "$CMD" | grep -qiE 'Co-Authored-By:[[:space:]]*Claude|Generated with \[?Claude Code|🤖 Generated with|claude\.com/claude-code|noreply@anthropic\.com'; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Remove Claude/Anthropic attribution from the commit message (no Co-Authored-By: Claude, no Generated with [Claude Code] footer, no 🤖 emoji), then retry."}}'
  exit 0
fi

exit 0
