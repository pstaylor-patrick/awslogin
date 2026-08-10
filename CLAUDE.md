# awslogin skill repo

This repo is the source of truth for the `/awslogin` Claude Code skill. Install system-wide with `ruby install.rb`.

Ruby stdlib only. No gems, no Bundler, no other language.

- `SKILL.md`: the skill definition loaded by Claude Code
- `bin/awslogin`: CLI that parses `~/.aws/config`, lists SSO login targets, and logs into them
- `install.rb`: symlinks `SKILL.md` into `~/.claude/skills/awslogin/` and the CLI into `~/bin/`
- `test/awslogin_test.rb`: minitest suite, run with `ruby test/awslogin_test.rb`

Profile data lives in `~/.aws/config` only. Do not reintroduce a registry file for it.
