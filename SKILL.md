---
description: Refresh AWS SSO logins for the profiles in ~/.aws/config and run CLI operations against a named account.
argument-hint:
- name ...
name: awslogin
---
# /awslogin

The user has invoked `/awslogin $ARGUMENTS`.

`~/.aws/config` is the only source of truth.

## Discover the login targets

```sh
awslogin list
```

Each line is one login target: `sso-session <name>: profile, profile, ...`, or
`profile <name>: <name>` for a profile carrying inline `sso_start_url` with no session.
One `aws sso login` refreshes every profile on that line.

Trust its output rather than reading `~/.aws/config` yourself. If it lists no targets, tell
the user to add profiles with `aws configure sso` and stop.

`awslogin list <name> ...` narrows the same output to the targets those names resolve to.
Use it as a dry run when you are unsure what a name will match, before running any login.

## Refreshing logins from inside Claude Code

Never run `aws sso login` in the foreground here. The browser flow blocks on a click you
cannot see, and the pending authorization expires (exit 255,
`The pending authorization to retrieve an SSO token has expired`). Use the device code flow
in the background instead, so the user gets the URL and the code while the command waits:

For each login target:

1. Start `aws sso login --profile <profile> --use-device-code --no-browser` as a background
   Bash command with a 600000ms timeout. Start every target before reporting anything, so all
   of them are waiting at once. `--no-browser` matters: without it the CLI tries to open a
   browser itself and never prints the autofill URL below.
2. Poll each command's output until the autofill URL appears (usually within a few seconds).
   The output looks like:

   ```
   Please visit the following URL:

   https://device.sso.us-east-1.amazonaws.com/

   Then enter the code:

   ABCD-EFGH

   Alternatively, you may visit the following URL which will autofill the code upon loading:
   https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH
   ```
3. Report every target in one message before waiting on any of them, as a list of
   `<sso-session or profile> covering <profiles>` with the autofill URL, so the user can just
   click through without copying a code. Give the plain URL and code too, as a fallback for
   when the autofill URL doesn't carry over (e.g. pasted into a different device). Codes
   expire in a few minutes, so do not withhold one while waiting on another.
4. Poll the background commands until each exits. Report each one as it finishes.
5. Verify with `aws sts get-caller-identity --profile <name>` for every profile the targets
   cover, and end with a one-line summary per profile: name, account, role, fresh or failed.

## Refreshing logins from a terminal

When the user is at a shell rather than in Claude Code, a human can approve the browser
prompt directly, so tell them to run:

```sh
awslogin login                     # browser flow, all targets in sequence
awslogin login --use-device-code   # device code flow, all targets in sequence
awslogin login amfm                # just the targets the name resolves to
awslogin servant amfm              # `login` is the default command
```

## Names were given

`awslogin list <name> ...` and `awslogin login <name> ...` take one or more names. The
command word is optional: `awslogin amfm` is `awslogin login amfm`.

A name selects whole login targets, never a bare profile, because one `aws sso login`
refreshes every profile on the target. Matching is case-insensitive and works like this:

1. An exact sso-session name (`amfm-sso`) or profile name (`amfm-production`) selects that
   profile's target outright. Exact always wins, so `j2j` means the profile `j2j` even
   though it is also a substring of `j2j-dns`.
2. Otherwise the name is matched as a substring against every session and profile name. It
   must land on exactly one login target. `amfm`, `servant`, `joinfold`, and `advantage`
   each do, and each selects that whole session group.

Several names union, deduped, in config order: `awslogin login servant amfm` refreshes both.

Every name is validated before any login runs, so a bad name fails the whole command and
logs into nothing. Two ways a name is rejected, both exit 2:

- No match at all: `No login target matches "nope". Run awslogin list to see them all.`
- Too vague: a name like `prod` can match production profiles across several unrelated
  accounts, so it names no single login and is refused rather than guessed at. The error
  lists every target it matched so the fix is obvious.

Do not retry a rejected name with a guess. Show the user the listed targets and ask which
one they meant, or type more of the name.

For each selected target: background device code login, surface the autofill URL, wait, then
`aws sts get-caller-identity --profile <name>`. Refresh unconditionally rather than guessing
whether the token is still valid; SSO tokens expire roughly daily.

Then confirm which account and role is active and proceed with the user's task. Pass
`--profile <name>` explicitly to every `aws` command. Never rely on the default profile or
on `AWS_PROFILE`.

## Production caution

Treat any profile whose name contains `prod` as production, plus any account the user has
called production. Before any write or destructive operation on one, say what will change
and get explicit confirmation.

This is also why `awslogin prod` is refused: `prod` spans several unrelated production
accounts, and picking one for the user would be exactly the wrong guess to make.

## Cost Explorer on org member accounts

`aws ce get-cost-and-usage` on a member account of an AWS Organization often fails with
`AccessDeniedException: User not enabled for cost explorer access`. That is an account
setting, not an IAM permission, and enabling it takes about 24 hours. The org's payer
account already has Cost Explorer data for every linked account, so query it there instead:
run the call against the payer profile with
`--group-by Type=DIMENSION,Key=LINKED_ACCOUNT` and filter to the member account's
`sso_account_id` (read it from `~/.aws/config`). Ask the user which profile is the payer
account if it is not obvious.
