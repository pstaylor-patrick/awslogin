# aws skill

Claude Code skill for working with AWS profiles. Sets the active profile context and provides guidance for SSO refresh, CLI operations, and multi-account workflows.

## Installation

```bash
./install.sh
```

This installs `/aws` system-wide as a Claude Code userSettings skill (symlinked into `~/.claude/skills/aws/`).

## Profiles

| Profile | Account | Auth |
|---|---|---|
| `cas-prod` | 261308960101 (us-east-2) | Static IAM key |
| `servant-internal` | 379604374638 (us-east-1) | SSO (servant-sso) |
| `cas-web-analytics` | 890679491189 (us-east-1) | SSO (servant-sso) |
| `cas360` | 312850677788 (us-west-2) | SSO (servant-sso) |
| `5ll-coaching` | 704629028390 (us-east-1) | SSO (servant-sso) |
| `personal` | 569032832755 | SSO (personal-sso) |
| `j2j` | 427827265964 (us-east-1) | SSO (personal-sso) |
| `joinfold-dns` | 477389928535 (us-east-1) | SSO (joinfold-sso) |

## Usage

```
/aws [profile]
```

No argument: refresh every saved profile in sequence. Named argument: force-refresh that profile's SSO token then proceed.
