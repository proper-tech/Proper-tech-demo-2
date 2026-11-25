#!/bin/bash
# PostToolUse hook (Edit|Write): after Claude changes a .ts/.tsx file under src/, type-check the project
# (about 2 s) and hand any errors back to Claude, so a broken import or prop is fixed in the same turn.
# Exit 2 = errors shown to Claude; anything else stays quiet.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$f" in
  */src/*.ts | */src/*.tsx) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$(npx --no-install tsc --noEmit -p . 2>&1) && exit 0
{
  echo "TypeScript errors after editing ${f#"$CLAUDE_PROJECT_DIR"/} (if you are midway through a change across several files, finish it first):"
  echo "$out" | head -30
} >&2
exit 2
