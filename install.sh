#!/usr/bin/env bash
# Install or uninstall the /aws Claude Code skill system-wide.
# Usage: ./install.sh [--uninstall]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/aws"
SKILL_LINK="$SKILL_DIR/SKILL.md"
SKILL_SRC="$REPO_DIR/SKILL.md"

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -L "$SKILL_LINK" ]]; then
    rm "$SKILL_LINK"
    echo "Uninstalled /aws (removed $SKILL_LINK)"
  else
    echo "Nothing to uninstall ($SKILL_LINK is not a symlink)"
  fi
  exit 0
fi

mkdir -p "$SKILL_DIR"
ln -sfn "$SKILL_SRC" "$SKILL_LINK"
echo "Installed /aws -> $SKILL_SRC"
