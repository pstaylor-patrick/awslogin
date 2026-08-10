# aws skill repo

This repo is the source of truth for the `/aws` Claude Code skill. Install system-wide with `ruby install.rb`.

- `SKILL.md`: the skill definition loaded by Claude Code
- `bin/aws-skill`: CLI that lists SSO login targets from `~/.aws/config` and logs into them
- `src/aws-config.js`: `~/.aws/config` parsing and session grouping
- `install.rb`: symlinks `SKILL.md` into `~/.claude/skills/aws/` and the CLI into `~/bin/`

Profile data lives in `~/.aws/config` only. Do not reintroduce a registry file for it.
