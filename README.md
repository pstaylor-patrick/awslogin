# aws skill

Claude Code skill plus a small CLI for refreshing AWS SSO logins across every profile in
`~/.aws/config`.

## Installation

```bash
ruby install.rb
```

Symlinks `/aws` into `~/.claude/skills/aws/` and `aws-skill` into `~/bin/`.

## Profiles

`~/.aws/config` is the only source of truth. Add profiles with `aws configure sso` or by
editing that file. Profiles that share an `sso_session` share a single login.

## Usage

```bash
aws-skill list                      # show login targets: one sso-session and the profiles it covers
aws-skill login                     # refresh every target, browser flow
aws-skill login --use-device-code   # refresh every target, device code flow
```

```
/aws [profile]
```

In Claude Code the skill runs the device code flow in the background and surfaces the
verification URL, the code, and which profiles each login covers, because the browser flow
needs a click nothing in the session can perform. With no argument it refreshes every
target, then verifies each profile with `aws sts get-caller-identity`.

## Development

```bash
npm install
npm test          # run once
npm run coverage  # enforces coverage thresholds (see vitest.config.js)
```

CI runs `npm run coverage` on every push to `main` and on pull requests targeting `main`.
