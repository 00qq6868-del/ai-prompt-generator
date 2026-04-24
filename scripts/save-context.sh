#!/bin/bash
# save-context.sh — One-click save all context files to GitHub
# Run this before ending an AI session to preserve progress

set -e

cd "$(dirname "$0")/.."

echo "📦 Saving context to GitHub..."

# Stage context files
git add context/ CLAUDE.md

# Check if there are changes to commit
if git diff --cached --quiet; then
  echo "✅ No context changes to commit"
else
  git commit -m "chore: update session context ($(date '+%Y-%m-%d %H:%M'))"
  echo "✅ Context committed"
fi

# Push to remote
echo "🚀 Pushing to GitHub..."
git push origin main && echo "✅ Pushed to GitHub" || {
  echo "⚠️  Push failed, retrying..."
  sleep 2
  git push origin main && echo "✅ Pushed to GitHub (retry)" || echo "❌ Push failed. Try manually: git push origin main"
}

echo ""
echo "📋 Context files saved:"
echo "   context/PROGRESS.md     — Task progress"
echo "   context/MEMORIES.md     — Decisions & preferences"
echo "   context/SESSION_LOG.md  — Session handoff log"
echo "   context/PROJECT_CONTEXT.md"
echo "   context/QUICK_START.md"
echo "   CLAUDE.md"
