#!/bin/bash
# Hook PostToolUse — typecheck sur les fichiers TypeScript modifiés

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -n "$FILE" ] && [[ "$FILE" =~ \.(ts|tsx)$ ]]; then
  # Seulement si tsconfig.json existe (projet scaffoldé)
  TSCONFIG=$(dirname "$FILE")
  ROOT="/home/x7c00/Documents/BUSINESS/scrapper"
  if [ -f "$ROOT/tsconfig.json" ]; then
    cd "$ROOT" && npx tsc --noEmit 2>/dev/null || true
  fi
fi
