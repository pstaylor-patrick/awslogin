---
description: Set AWS profile context and run CLI operations against the named account.
argument-hint: [cas-prod|servant-internal|cas-web-analytics|cas360|5ll-coaching|personal|j2j|joinfold-dns]
---

# /aws

The user has invoked `/aws $ARGUMENTS`.

Determine which AWS profile to work with based on the argument:
- `cas-prod` → profile `cas-prod`, account `261308960101` (us-east-2), the **real** CAS-owned ("Come and See Foundation"-funded) production account that CAS360 runs in. Auth is a **static IAM access key** for user `patrickt@servant.io`, NOT SSO.
- `servant-internal` → profile `servant-internal`, account `379604374638` (us-east-1), a Servant-internal account. SSO-based.
- `cas-web-analytics` → profile `cas-web-analytics`, account `890679491189` (us-east-1), the CAS web-analytics account. SSO-based.
- `cas360` → profile `cas360`, account `312850677788` (us-west-2), a CAS360 account. SSO-based, sharing the same Identity Center and underlying user (`servant-patrickt`) as `servant-internal` and `cas-web-analytics`.
- `5ll-coaching` → profile `5ll-coaching`, account `704629028390` (us-east-1). SSO-based, sharing the same Identity Center and underlying user (`servant-patrickt`) as `servant-internal`, `cas-web-analytics`, and `cas360`.
- `personal` → profile `personal`, account `569032832755`, used for personal DNS management (Route53 hosted zones, e.g. `servant.run`). SSO-based.
- `j2j` → profile `j2j`, account `427827265964` (us-east-1). SSO-based, sharing the same Identity Center and underlying user as `personal`.
- `joinfold-dns` → profile `joinfold-dns`, account `477389928535` (us-east-1), the Join Fold DNS/Route53 account. SSO-based via `joinfold-sso` (portal `https://d-9066732395.awsapps.com/start`, user `joinfold-patrick`).

`servant-internal`, `cas-web-analytics`, `cas360`, and `5ll-coaching` all live in the **same** AWS IAM Identity Center org/managing instance (the `servant-sso` session) under the same underlying user identity (`servant-patrickt`). A single `aws sso login` against any of them therefore authenticates all four. `personal` and `j2j` share a separate Identity Center (`personal-sso`) under the same underlying user (`pstaylor-patrick`), so one `aws sso login` against either authenticates both. `joinfold-dns` has its own separate Identity Center (`joinfold-sso`, managing instance `ssoins-7223bf7e4ce45ae3`) under user `joinfold-patrick` — its login is independent of all others. `cas-prod` is a static IAM key outside SSO entirely.

## How SSO logins work here (read before refreshing)

- **Run `aws sso login --profile <profile>` in the FOREGROUND as a blocking command — never background it.** The SSO authorization window is short: if the login is backgrounded or the browser approval is not completed promptly, it fails with `The pending authorization to retrieve an SSO token has expired` (exit 255). Use a generous timeout (e.g. 180000ms) and **tell the user to approve it promptly** in the browser.
- **Fallback:** if the browser / localhost-callback flow gets disrupted or keeps expiring, retry with `aws sso login --profile <profile> --use-device-code` — it gives the user a code to enter and does not depend on a localhost callback.
- **One login covers its siblings.** A `personal-sso` login (via `personal` or `j2j`) refreshes BOTH `personal` and `j2j`; a `servant-sso` login (via `servant-internal`, `cas-web-analytics`, or `cas360`) refreshes ALL THREE of those. `joinfold-sso` is standalone — a login via `joinfold-dns` only covers that profile. So you never need more than **three** SSO logins total to cover all SSO profiles.
- **SSO tokens expire (~daily).** Never assume a token is still fresh just because it was refreshed earlier or in a prior session — always verify with `aws sts get-caller-identity`, or force-refresh.

## Copy the 1Password password to the clipboard before each SSO login

Each `aws sso login` opens a browser that prompts for the 1Password account password. **Immediately before** running `aws sso login`, copy the matching password to the clipboard via the `op` CLI so the user can paste it. The command pipes straight into `pbcopy` and writes nothing to stdout, so the secret never lands in the transcript — never add `--reveal` to a command whose output is shown, and never `echo` the value.

There are three passwords to copy, one per Identity Center:

- **`personal-sso`** (covers `personal` + `j2j`) — 1Password account `my.1password.com`:
  ```
  op item get zx2pf2p6pr3hbugty6qnbile4e --vault ahg5jjg7duaen7an3ahafwbyhm --account my.1password.com --fields label=password --reveal | tr -d '\n' | pbcopy
  ```
- **`servant-sso`** (covers `servant-internal` + `cas-web-analytics` + `cas360` + `5ll-coaching`) — 1Password account `team-servant.1password.com`:
  ```
  op item get kdtwxkazw47pmlimyrmfmtsnhu --vault 4rdg7ojinlqeanptczsnvwf5hm --account team-servant.1password.com --fields label=password --reveal | tr -d '\n' | pbcopy
  ```
- **`joinfold-sso`** (covers `joinfold-dns`) — 1Password account `my.1password.com`:
  ```
  op item get siox3bsl6j5zr7yj5iksfcrkwa --vault ahg5jjg7duaen7an3ahafwbyhm --account my.1password.com --fields label=password --reveal | tr -d '\n' | pbcopy
  ```

After the copy, tell the user the password is on their clipboard, ready to paste. If `op` errors (e.g. not signed in: `op signin --account <host>` may be needed), say so and continue with the login anyway — the copy is a convenience, not a blocker. `cas-prod` is a static IAM key with no browser login, so there is **no** password to copy for it.

## No argument — refresh every saved profile, one at a time

If no argument (or an unrecognized one) is given, do **not** just list the profiles and ask. Instead **eagerly refresh the MFA / SSO token for every saved profile, one at a time**, narrating each step in the chat as you go. Because one login per Identity Center covers its siblings (see above), this takes **three** SSO logins plus verifications:

1. Announce `personal`, copy the `personal-sso` password to the clipboard (see section above), then run `aws sso login --profile personal` (foreground; ask the user to approve promptly and tell them the password is on their clipboard). This refreshes the `personal-sso` pair. Verify with `aws sts get-caller-identity --profile personal`, then `--profile j2j`; report each account + role.
2. Announce `servant-internal`, copy the `servant-sso` password to the clipboard (see section above), then run `aws sso login --profile servant-internal` (foreground; approve promptly; password is on the clipboard). This refreshes the `servant-sso` quad. Verify `--profile servant-internal`, then `--profile cas-web-analytics`, then `--profile cas360`, then `--profile 5ll-coaching`; report each.
3. Announce `joinfold-dns`, copy the `joinfold-sso` password to the clipboard (see section above), then run `aws sso login --profile joinfold-dns` (foreground; ask the user to approve promptly and tell them the password is on their clipboard). Verify with `aws sts get-caller-identity --profile joinfold-dns`; report account + role.
4. Announce `cas-prod`: it is a **static IAM key**, so there is no SSO/MFA token to refresh — just run `aws sts get-caller-identity --profile cas-prod` to verify. If it fails, tell the user the key needs restoring from 1Password item **"CAS AWS Patrick (060526)"** (servant vault, "Employee" → "CLI Access Keys") and do **not** attempt `aws sso login` for it.

End with a one-line summary of all eight (account + role + fresh/failed).

## Named profile — always force-refresh, then proceed

If a specific profile **is** named, **always refresh its MFA / SSO token even if it is already fresh**:
1. **SSO profiles** (`servant-internal`, `cas-web-analytics`, `cas360`, `5ll-coaching`, `personal`, `j2j`, `joinfold-dns`): first copy the matching password to the clipboard (see "Copy the 1Password password" above — `personal`/`j2j` → `personal-sso` item; `servant-internal`/`cas-web-analytics`/`cas360`/`5ll-coaching` → `servant-sso` item; `joinfold-dns` → `joinfold-sso` item), then run `aws sso login --profile <profile>` **unconditionally** (foreground, never backgrounded; ask the user to approve promptly and note the password is on their clipboard; use the `--use-device-code` fallback if the browser flow is disrupted) — do not skip the login just because a token is still valid. Then `aws sts get-caller-identity --profile <profile>` to confirm.
2. **`cas-prod`**: static IAM key, so `aws sso login` does **not** apply and there is no token to force-refresh. Run `aws sts get-caller-identity --profile cas-prod`. If it fails, the key is missing/rotated/revoked — tell the user to refresh it from 1Password item **"CAS AWS Patrick (060526)"** (servant vault, "Employee" → "CLI Access Keys") and stop until restored. Do NOT attempt SSO login.
3. Confirm which account and role is active.
4. Ask the user what they'd like to do, or if they already stated a task, proceed with it — always passing `--profile <profile>` to every AWS CLI command.

Always use the explicit `--profile` flag on every `aws` command. Never rely on the default profile or environment variables.

**Caution:** `cas-prod` is the live CAS-owned production account — treat write operations there with care and confirm before anything destructive.
