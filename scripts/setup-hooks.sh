#!/bin/bash
# Set up git hooks for the repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Get the actual git dir (handles worktrees)
GIT_DIR=$(git rev-parse --git-dir)

echo "Setting up git hooks..."
echo "Git dir: $GIT_DIR"

# Create hooks directory if it doesn't exist
mkdir -p "$GIT_DIR/hooks"

# Symlink pre-commit hook
ln -sf "$SCRIPT_DIR/pre-commit" "$GIT_DIR/hooks/pre-commit"
chmod +x "$GIT_DIR/hooks/pre-commit"

echo "✅ Git hooks installed!"
echo "   Pre-commit hook will run: tsc, eslint, ruff, pyright"
