#!/usr/bin/env bash
# Claude Code PreToolUse hook (matcher: Bash). Reads tool-call JSON on stdin.
# Exit 2 = block the call; stderr is shown to the agent. Exit 0 = allow.
# Mechanical backstop for rules/03-git.md — rules in markdown are only requests.
set -u
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

block() { echo "BLOCKED by .streamliner/hooks/guard-git.sh: $1. See .streamliner/rules/03-git.md. Ask the user if this is truly needed." >&2; exit 2; }

# Only inspect commands that invoke git
case "$cmd" in *git*) ;; *) exit 0 ;; esac

echo "$cmd" | grep -Eq 'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?push([^&;|]*)[[:space:]](-f|--force|--force-with-lease)\b' && block "force push"
echo "$cmd" | grep -Eq 'git[[:space:]]+push[^&;|]*[[:space:]]\+[^[:space:]]' && block "force push via +refspec"
echo "$cmd" | grep -Eq 'git[[:space:]]+push[^&;|]*[[:space:]](origin[[:space:]]+)?(HEAD:)?(main|master|release/[^[:space:]]*)([[:space:]]|$)' && block "push to protected branch"
echo "$cmd" | grep -Eq -- '--no-verify|--no-gpg-sign|-c[[:space:]]+core\.hooksPath' && block "hook/signing bypass"
echo "$cmd" | grep -Eq 'git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-[a-zA-Z]*f|checkout[[:space:]]+--[[:space:]]+\.|restore[[:space:]]+\.|branch[[:space:]]+-D|stash[[:space:]]+(drop|clear)|filter-branch|config|remote[[:space:]]+(add|set-url|remove))' && block "destructive or config-changing git command"
echo "$cmd" | grep -Eq 'git[[:space:]]+add[[:space:]]+(-A|--all|\.)([[:space:]]|$)' && block "blanket staging; use 'git add -- <explicit paths>'"

# Commit on protected branch
if echo "$cmd" | grep -Eq 'git[[:space:]]+commit'; then
  br=$(git branch --show-current 2>/dev/null)
  case "$br" in main|master) block "commit on protected branch '$br'; create a feature branch first" ;; esac
fi
exit 0
