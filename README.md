# aws skill

Claude Code skill for working with AWS profiles. Sets the active profile context and provides guidance for SSO refresh, CLI operations, and multi-account workflows.

## Installation

```bash
ruby install.rb
```

This installs `/aws` system-wide as a Claude Code userSettings skill (symlinked into `~/.claude/skills/aws/`).

## Profiles

| Profile | Account | Auth |
|---|---|---|
| `personal` | 569032832755 (us-east-1) | SSO (personal-sso) |
| `j2j` | 427827265964 (us-east-1) | SSO (personal-sso) |
| `j2j-staging` | 985823270538 (us-east-1) | SSO (personal-sso) |
| `j2j-production` | 202689043194 (us-east-1) | SSO (personal-sso) |
| `leagueos` | 673586358710 (us-east-1) | SSO (personal-sso) |
| `servant-internal` | 379604374638 (us-east-1) | SSO (servant-sso) |
| `5ll-coaching` | 704629028390 (us-east-1) | SSO (servant-sso) |
| `customer360-example` | 200774432632 (us-east-1) | SSO (servant-sso) |
| `servant-payer` | 739272173615 (us-east-1) | SSO (servant-sso) |
| `amfm-staging` | 851276831366 (us-east-1) | SSO (servant-sso) |

## Usage

```
/aws [profile]
```

No argument: refresh every saved profile in sequence. Named argument: force-refresh that profile's SSO token then proceed.

## Password copy before SSO login

An `ssoSession` may carry an optional `passwordStore`. When present, the skill copies that account's IdP password to the clipboard just before `aws sso login` opens the browser, so it is ready to paste. The store lives on the session, not the profile, because one login covers every sibling profile sharing the session.

For `provider: "1password"`, the copy uses `op-cli` (the [`/op` skill's wrapper](../1password), installed on PATH) and resolves `op://<vaultId>/<itemId>/<field>` with `OP_ACCOUNT` set to `account`. The item references are personal, so they live only in your untracked `~/.aws-skill/profiles.json`, never in this repo. See `profiles.example.json` for the shape.

## Development

```bash
npm install
npm test          # run once
npm run coverage  # enforces coverage thresholds (see vitest.config.js)
```

CI runs `npm run coverage` on every push to `main` and on pull requests targeting `main`.
