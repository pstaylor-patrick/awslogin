import { readFileSync } from "node:fs";
import { join } from "node:path";

export function configPath(home) {
  return join(home, ".aws-skill", "profiles.json");
}

export function loadConfig(home) {
  const path = configPath(home);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(`No config found at ${path}. Run: aws-skill register`);
    }
    throw err;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
  return validateConfig(obj);
}

export function validateConfig(obj) {
  const result = { ...obj };
  if (result.profiles == null) result.profiles = {};
  if (result.ssoSessions == null) result.ssoSessions = {};

  for (const [name, profile] of Object.entries(result.profiles)) {
    if (!/^\d{12}$/.test(profile.accountId)) {
      throw new Error(`Profile '${name}': accountId must be a 12-digit string`);
    }
    if (typeof profile.region !== "string" || !profile.region) {
      throw new Error(`Profile '${name}': region must be a non-empty string`);
    }
    if (profile.auth !== "sso" && profile.auth !== "iam-static") {
      throw new Error(`Profile '${name}': auth must be "sso" or "iam-static"`);
    }
    if (profile.production == null) {
      profile.production = false;
    }
    if (profile.auth === "sso") {
      if (typeof profile.roleName !== "string" || !profile.roleName) {
        throw new Error(`Profile '${name}': roleName must be a non-empty string for sso auth`);
      }
      if (typeof profile.ssoSession !== "string" || !profile.ssoSession) {
        throw new Error(`Profile '${name}': sso auth requires a non-empty ssoSession`);
      }
      if (!result.ssoSessions[profile.ssoSession]) {
        throw new Error(`Profile '${name}' references unknown ssoSession '${profile.ssoSession}'`);
      }
    } else {
      // iam-static: roleName can be null or a non-empty string
      if (profile.roleName != null && (typeof profile.roleName !== "string" || !profile.roleName)) {
        throw new Error(`Profile '${name}': roleName must be null or a non-empty string`);
      }
      if (profile.ssoSession != null) {
        throw new Error(`Profile '${name}': iam-static auth must have null ssoSession`);
      }
    }
  }

  for (const [name, session] of Object.entries(result.ssoSessions)) {
    if (!/^https:\/\//.test(session.startUrl)) {
      throw new Error(`ssoSession '${name}': startUrl must start with https://`);
    }
    if (typeof session.region !== "string" || !session.region) {
      throw new Error(`ssoSession '${name}': region must be a non-empty string`);
    }
    validatePasswordStore(`ssoSession '${name}'`, session.passwordStore);
    if (session.payerProfile != null) {
      if (typeof session.payerProfile !== "string" || !session.payerProfile) {
        throw new Error(`ssoSession '${name}': payerProfile must be a non-empty string`);
      }
      if (!result.profiles[session.payerProfile]) {
        throw new Error(`ssoSession '${name}': payerProfile references unknown profile '${session.payerProfile}'`);
      }
    }
  }

  return result;
}

// passwordStore lives on the ssoSession: a single SSO login covers every sibling
// profile sharing the session, so the password to copy is per-session, not per-profile.
function validatePasswordStore(label, passwordStore) {
  if (passwordStore == null) return;
  if (typeof passwordStore.provider !== "string" || !passwordStore.provider) {
    throw new Error(`${label}: passwordStore.provider must be a non-empty string`);
  }
  if (passwordStore.provider === "1password") {
    for (const field of ["account", "itemId", "vaultId", "field"]) {
      if (typeof passwordStore[field] !== "string" || !passwordStore[field]) {
        throw new Error(`${label}: passwordStore.${field} must be a non-empty string`);
      }
    }
  }
}

export function listProfiles(config) {
  return Object.keys(config.profiles);
}
