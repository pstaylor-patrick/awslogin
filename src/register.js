import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { configPath } from "./config.js";

export function buildProfileEntry(answers) {
  const profileEntry = {
    accountId: answers.accountId,
    region: answers.region,
    roleName: answers.roleName ?? null,
    auth: answers.auth,
    production: answers.production ?? false,
    ssoSession: answers.ssoSession ?? null,
  };

  let ssoSessionEntry = null;
  if (answers.auth === "sso" && answers.newSsoSession && answers.ssoSession) {
    ssoSessionEntry = {
      startUrl: answers.ssoStartUrl,
      region: answers.ssoRegion,
      passwordStore: answers.passwordStore ?? null,
      payerProfile: answers.isPayerAccount ? answers.name : null,
    };
  }

  return { profileEntry, ssoSessionEntry };
}

// The payer/management account of an AWS Organization is what Cost Explorer must be
// queried against for linked member accounts that don't have CE enabled themselves.
export async function askIsPayerAccount(ask) {
  const wants = (
    await ask("Is this the org's payer/management account, for cross-account Cost Explorer? (y/n): ")
  ).trim().toLowerCase();
  return wants === "y" || wants === "yes";
}

// The password is the IdP login for the SSO session, so we only ask when a new
// session is being created. Returns null when the user declines.
export async function askPasswordStore(ask) {
  const wants = (await ask("Add password store for this SSO session? (y/n): ")).trim().toLowerCase();
  if (wants !== "y" && wants !== "yes") return null;

  const provider = (await ask("Provider (e.g. 1password): ")).trim();
  if (provider !== "1password") return { provider };

  const account = (await ask("1Password account (e.g. my.1password.com): ")).trim();
  const itemId = (await ask("Item ID: ")).trim();
  const vaultId = (await ask("Vault ID: ")).trim();
  const field = (await ask("Field (e.g. password): ")).trim();
  return { provider, account, itemId, vaultId, field };
}

export function renderAwsConfigStanza(answers, existingAwsConfig) {
  // Idempotent: if profile already in config, return empty string
  if (existingAwsConfig.includes(`[profile ${answers.name}]`)) {
    return "";
  }

  let stanza = `[profile ${answers.name}]\n`;
  stanza += `region = ${answers.region}\n`;

  if (answers.auth === "sso") {
    stanza += `sso_session = ${answers.ssoSession}\n`;
    stanza += `sso_account_id = ${answers.accountId}\n`;
    stanza += `sso_role_name = ${answers.roleName}\n`;
    stanza += `\n`;

    // Add session block only if we have the data and it's not already there
    if (
      answers.ssoStartUrl &&
      !existingAwsConfig.includes(`[sso-session ${answers.ssoSession}]`)
    ) {
      stanza += `[sso-session ${answers.ssoSession}]\n`;
      stanza += `sso_start_url = ${answers.ssoStartUrl}\n`;
      stanza += `sso_region = ${answers.ssoRegion}\n`;
      stanza += `sso_registration_scopes = sso:account:access\n`;
    }
  } else {
    // iam-static: no sso_* lines; note about credentials
    stanza += `# Add credentials to ~/.aws/credentials under [${answers.name}]\n`;
  }

  return stanza;
}

export function mergeIntoConfig(existingConfig, { profileEntry, ssoSessionEntry, name, ssoSessionName, payerProfilePatch }) {
  const profiles = { ...existingConfig.profiles, [name]: profileEntry };
  let ssoSessions = { ...existingConfig.ssoSessions };
  if (ssoSessionEntry && ssoSessionName) {
    ssoSessions = { ...ssoSessions, [ssoSessionName]: ssoSessionEntry };
  }
  // Reusing an existing session: patch its payerProfile in place instead of
  // replacing the whole entry, since ssoSessionEntry is null in that case.
  if (payerProfilePatch && ssoSessions[payerProfilePatch.ssoSessionName]) {
    ssoSessions = {
      ...ssoSessions,
      [payerProfilePatch.ssoSessionName]: {
        ...ssoSessions[payerProfilePatch.ssoSessionName],
        payerProfile: payerProfilePatch.profileName,
      },
    };
  }
  return { ...existingConfig, profiles, ssoSessions };
}

export async function registerInteractive({ home, prompt: promptFn } = {}) {
  let rl = null;
  if (!promptFn) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    promptFn = (q) => rl.question(q);
  }

  try {
    const ask = promptFn;

    const name = (await ask("Profile name: ")).trim();
    const auth = (await ask("Auth type (sso/iam-static): ")).trim();

    let accountId;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      accountId = (await ask("Account ID (12 digits): ")).trim();
      if (/^\d{12}$/.test(accountId)) break;
      // re-ask on bad input
    }

    const region = (await ask("Region: ")).trim();

    // Load existing config early (needed to show existing SSO sessions)
    const cfgPath = configPath(home);
    let existingConfig;
    try {
      const raw = readFileSync(cfgPath, "utf8");
      existingConfig = JSON.parse(raw);
      if (!existingConfig.profiles) existingConfig.profiles = {};
      if (!existingConfig.ssoSessions) existingConfig.ssoSessions = {};
    } catch {
      existingConfig = { profiles: {}, ssoSessions: {} };
    }

    let roleName = null;
    let ssoSession = null;
    let ssoStartUrl = null;
    let ssoRegion = null;
    let newSsoSession = false;
    let passwordStore = null;
    let isPayerAccount = false;

    if (auth === "sso") {
      roleName = (await ask("Role name: ")).trim();

      const existingSessions = Object.keys(existingConfig.ssoSessions);
      if (existingSessions.length > 0) {
        const reuse = (
          await ask(
            `Existing sso sessions: ${existingSessions.join(", ")}. Reuse one? (name or blank for new): `
          )
        ).trim();
        if (reuse && existingSessions.includes(reuse)) {
          ssoSession = reuse;
        } else {
          newSsoSession = true;
        }
      } else {
        newSsoSession = true;
      }

      if (newSsoSession) {
        ssoSession = (await ask("SSO session name: ")).trim();
        ssoStartUrl = (await ask("SSO start URL (https://...): ")).trim();
        ssoRegion = (await ask("SSO region: ")).trim();
        passwordStore = await askPasswordStore(ask);
      }

      isPayerAccount = await askIsPayerAccount(ask);
    }

    const answers = {
      name,
      auth,
      accountId,
      region,
      roleName,
      ssoSession,
      ssoStartUrl,
      ssoRegion,
      newSsoSession,
      passwordStore,
      isPayerAccount,
      production: false,
    };

    const { profileEntry, ssoSessionEntry } = buildProfileEntry(answers);
    const newConfig = mergeIntoConfig(existingConfig, {
      profileEntry,
      ssoSessionEntry,
      name,
      ssoSessionName: newSsoSession ? ssoSession : null,
      payerProfilePatch: !newSsoSession && isPayerAccount ? { ssoSessionName: ssoSession, profileName: name } : null,
    });

    // Write profiles.json with restricted permissions
    const configDir = join(home, ".aws-skill");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(cfgPath, JSON.stringify(newConfig, null, 2), { mode: 0o600 });

    // Handle ~/.aws/config
    const awsConfigPath = join(home, ".aws", "config");
    let existingAwsConfig = "";
    try {
      existingAwsConfig = readFileSync(awsConfigPath, "utf8");
    } catch {
      existingAwsConfig = "";
    }

    const wrote = [cfgPath];
    const stanza = renderAwsConfigStanza(answers, existingAwsConfig);
    if (stanza) {
      mkdirSync(join(home, ".aws"), { recursive: true });
      const separator =
        existingAwsConfig && !existingAwsConfig.endsWith("\n") ? "\n" : "";
      writeFileSync(awsConfigPath, existingAwsConfig + separator + stanza);
      wrote.push(awsConfigPath);
    }

    return { wrote, profile: name, skipped: [] };
  } finally {
    if (rl) rl.close();
  }
}
