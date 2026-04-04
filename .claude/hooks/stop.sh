#!/bin/bash
# Hook Stop — vérifie que le build TypeScript passe avant de terminer

ROOT="/home/x7c00/Documents/BUSINESS/scrapper"
cd "$ROOT"

if [ -f "tsconfig.json" ] && [ -f "package.json" ]; then
  echo "Vérification TypeScript..."
  npx tsc --noEmit 2>&1
else
  echo "Projet non encore scaffoldé — skip typecheck"
  exit 0
fi
