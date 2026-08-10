# aws skill repo

This repo is the source of truth for the `/aws` Claude Code skill. Install system-wide with `ruby install.rb`.

Ruby stdlib only. No gems, no Bundler, no other language.

- `SKILL.md`: the skill definition loaded by Claude Code
- `bin/awslogin`: CLI that parses `~/.aws/config`, lists SSO login targets, and logs into them
- `install.rb`: symlinks `SKILL.md` into `~/.claude/skills/aws/` and the CLI into `~/bin/`
- `test/aws_skill_test.rb`: minitest suite, run with `ruby test/aws_skill_test.rb`

Profile data lives in `~/.aws/config` only. Do not reintroduce a registry file for it.
