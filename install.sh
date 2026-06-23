#!/usr/bin/env bash
# Install or uninstall the /aws Claude Code skill system-wide.
# Usage: ./install.sh [--uninstall]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/aws"
SKILL_LINK="$SKILL_DIR/SKILL.md"
SKILL_SRC="$REPO_DIR/SKILL.md"
BIN_DIR="$HOME/bin"
CLI_LINK="$BIN_DIR/aws-skill"
CLI_SRC="$REPO_DIR/bin/aws-skill"

if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -L "$SKILL_LINK" ]]; then
    rm "$SKILL_LINK"
    echo "Uninstalled /aws (removed $SKILL_LINK)"
  else
    echo "Nothing to uninstall ($SKILL_LINK is not a symlink)"
  fi
  if [[ -L "$CLI_LINK" ]]; then
    rm "$CLI_LINK"
    echo "Uninstalled aws-skill CLI (removed $CLI_LINK)"
  fi
  exit 0
fi

mkdir -p "$SKILL_DIR"
ln -sfn "$SKILL_SRC" "$SKILL_LINK"
echo "Installed /aws -> $SKILL_SRC"
mkdir -p "$BIN_DIR"
ln -sfn "$CLI_SRC" "$CLI_LINK"
echo "Installed aws-skill CLI -> $CLI_SRC"
