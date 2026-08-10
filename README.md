# aws skill

Refreshes AWS SSO logins for every profile in `~/.aws/config`. A `/aws` Claude Code skill
plus the Ruby CLI it runs on. No gems, no registry file: `~/.aws/config` is the only source
of truth, add profiles there with `aws configure sso`.

## Install

```bash
ruby install.rb
```

Symlinks `/aws` into `~/.claude/skills/aws/` and `aws-skill` into `~/bin/`.

## Usage

```bash
aws-skill list                      # login targets: one sso-session and the profiles it covers
aws-skill login                     # refresh every target, browser flow
aws-skill login --use-device-code   # refresh every target, device code flow
```

`/aws [profile]` does the same from Claude Code, but backgrounds each login as a device
code flow and surfaces the URL and code up front, since the browser flow needs a click
Claude cannot perform.

## Development

```bash
ruby test/aws_skill_test.rb
```

CI runs this on every push to `main` and on pull requests targeting `main`.
