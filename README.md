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

## Why this exists

The AWS CLI already does the actual work here; this repo does not replace it. From a
terminal, `aws-skill` just saves you from reading `~/.aws/config` by hand to figure out
which profiles share an `sso_session` and can skip a redundant login. The real reason to
run this from Claude Code is that `aws sso login`'s default browser flow blocks on a click
an agent session cannot make and the pending authorization just expires. The `/aws` skill
is what makes SSO refresh actually work from inside Claude Code at all.

## Development

```bash
ruby test/aws_skill_test.rb
```

CI runs this on every push to `main` and on pull requests targeting `main`.
