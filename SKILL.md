---
description: Set AWS profile context and run CLI operations against the named account.
argument-hint:
- profile-name
name: aws
---
# /aws

The user has invoked `/aws $ARGUMENTS`.

## Load configuration

First, run:

```sh
cat ~/.aws-skill/profiles.json
```

If the file is missing (cat exits non-zero or reports "No such file"), tell the user to run `aws-skill register` and stop. Do not proceed further.

Parse the JSON to discover:
- **profiles**: each entry's `accountId`, `region`, `roleName`, `auth`, `ssoSession`, and `production` flag
- **ssoSessions**: each session's `startUrl`, `region`, optional `passwordStore`, and optional `payerProfile`
- **sibling groups**: which profiles share the same `ssoSession` value (a single SSO login covers all siblings in a group)
- **preferences** (optional top-level key): personal overrides such as `onepasswordTool` (the binary used to read 1Password secrets; defaults to `op`)

## How SSO logins work

- **Run `aws sso login --profile <profile>` in the FOREGROUND as a blocking command. Never background it.** The SSO authorization window is short: if backgrounded or not approved promptly, it fails with `The pending authorization to retrieve an SSO token has expired` (exit 255). Use a generous timeout (180000ms) and **tell the user to approve it promptly** in the browser.
- **Fallback:** if the browser / localhost-callback flow is disrupted or keeps expiring, retry with `aws sso login --profile <profile> --use-device-code`. This gives the user a code to enter without depending on a localhost callback.
- **One login covers siblings.** All profiles sharing the same `ssoSession` value are authenticated by a single `aws sso login`. Compute sibling groups from the config before running any logins.
- **SSO tokens expire (~daily).** Never assume a token is still fresh. Always verify with `aws sts get-caller-identity`, or force-refresh.

## Copying the account password before SSO login

The password belongs to the SSO session, not the individual profile: one login covers every sibling profile in the group, so each `ssoSession` carries at most one `passwordStore`.

For any `ssoSession` whose `passwordStore` has `provider === "1password"`:

**Immediately before** running `aws sso login`, copy the password to the clipboard. Determine the tool to use:

1. Check `preferences.onepasswordTool` in `profiles.json`. If set, use that binary.
2. Otherwise default to `op` (the standard 1Password CLI).

Then run:

```sh
OP_ACCOUNT="<account>" <tool> read "op://<vaultId>/<itemId>/<field>" | tr -d '\n' | pbcopy
```

Do not `echo` the value or let it land in the terminal transcript. If the command fails, note the failure and continue with the login anyway.

Tell the user the password is on their clipboard.

## Cross-account billing audits

Member accounts in an AWS Organization often have Cost Explorer disabled at the account
level (`aws ce get-cost-and-usage` returns `AccessDeniedException: User not enabled for
cost explorer access`). This is an account setting, not an IAM permission, and enabling
it takes about 24 hours to take effect after being turned on in that account's Billing
console. Cost Explorer on the org's payer/management account already covers every linked
account, so route around the block instead of waiting on it:

1. Find the profile's `ssoSession` entry. If it has a `payerProfile`, that names another
   profile in the same config with Cost Explorer access to the whole organization.
2. Query Cost Explorer against the `payerProfile`, grouped by `Type=DIMENSION,Key=LINKED_ACCOUNT`,
   and filter to the member account's `accountId` to get that account's costs.
3. If the session has no `payerProfile`, tell the user this account's costs aren't reachable
   yet and that they can register the org's management account as a profile (`aws-skill
   register`, answering yes to "Is this the org's payer/management account?") to unlock it.

## Production caution

If a profile has `"production": true`, treat every write or destructive AWS operation with extra care. Before any action that modifies or deletes resources, confirm explicitly with the user and remind them this is a production account.

## No argument: refresh every profile

If no argument (or an unrecognized one) is given, do **not** just list profiles and ask. Instead, **eagerly refresh every profile**, narrating each step:

1. Group SSO profiles by `ssoSession`. For each unique session group:
   a. Announce which profiles this session covers.
   b. If the session has a `passwordStore`, copy the password to the clipboard (see above) before the login.
   c. Run `aws sso login --profile <any-profile-in-the-group>` (foreground; ask the user to approve promptly; note the password is on their clipboard if applicable). This refreshes all profiles sharing that session.
   d. Verify each profile in the group: `aws sts get-caller-identity --profile <name>`; report account and role.

2. For each `iam-static` profile:
   a. Run `aws sts get-caller-identity --profile <name>` to verify.
   b. If it fails, tell the user the credentials need restoring. Do **not** attempt `aws sso login` for it.

3. End with a one-line summary for every profile (name, account, role, fresh/failed).

## Named profile: always force-refresh, then proceed

If a specific profile **is** named:

1. **SSO profiles** (`auth === "sso"`):
   a. If the profile's `ssoSession` has a `passwordStore`, copy the password to the clipboard (see above).
   b. Run `aws sso login --profile <name>` **unconditionally** (foreground, never backgrounded; ask the user to approve promptly; note the password is on their clipboard if applicable; use `--use-device-code` if the browser flow is disrupted). Do not skip the login even if the token appears fresh.
   c. Run `aws sts get-caller-identity --profile <name>` to confirm.

2. **Static IAM profiles** (`auth === "iam-static"`): Run `aws sts get-caller-identity --profile <name>`. If it fails, tell the user to restore the credentials and stop. Do **not** attempt `aws sso login`.

3. Confirm which account and role is active.

4. Ask what the user would like to do (or proceed if they already stated a task). Always pass `--profile <name>` to every `aws` CLI command.

Always use the explicit `--profile` flag on every `aws` command. Never rely on the default profile or environment variables.
