import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildProfileEntry,
  renderAwsConfigStanza,
  mergeIntoConfig,
  registerInteractive,
} from "../src/register.js";
import { validateConfig } from "../src/config.js";

let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-reg-test-"));
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

/** Returns an async function that returns answers in sequence. */
function makePrompt(answers) {
  let i = 0;
  return async (_question) => answers[i++] ?? "";
}

// ---- buildProfileEntry ----

describe("buildProfileEntry", () => {
  it("builds a valid SSO entry with new session", () => {
    const answers = {
      name: "my-sso",
      auth: "sso",
      accountId: "123456789012",
      region: "us-east-1",
      roleName: "AdminAccess",
      ssoSession: "my-session",
      ssoStartUrl: "https://example.awsapps.com/start",
      ssoRegion: "us-east-1",
      newSsoSession: true,
      passwordStore: null,
      production: false,
    };
    const { profileEntry, ssoSessionEntry } = buildProfileEntry(answers);
    expect(profileEntry.auth).toBe("sso");
    expect(profileEntry.accountId).toBe("123456789012");
    expect(profileEntry.roleName).toBe("AdminAccess");
    expect(profileEntry.ssoSession).toBe("my-session");
    expect(profileEntry.production).toBe(false);
    expect(ssoSessionEntry).toEqual({
      startUrl: "https://example.awsapps.com/start",
      region: "us-east-1",
      passwordStore: null,
    });
  });

  it("returns null ssoSessionEntry when reusing existing session", () => {
    const answers = {
      name: "my-sso",
      auth: "sso",
      accountId: "123456789012",
      region: "us-east-1",
      roleName: "AdminAccess",
      ssoSession: "existing-session",
      ssoStartUrl: null,
      ssoRegion: null,
      newSsoSession: false,
      passwordStore: null,
      production: false,
    };
    const { ssoSessionEntry } = buildProfileEntry(answers);
    expect(ssoSessionEntry).toBeNull();
  });

  it("builds a valid iam-static entry with null ssoSession and null roleName", () => {
    const answers = {
      name: "my-iam",
      auth: "iam-static",
      accountId: "123456789013",
      region: "us-west-2",
      roleName: null,
      ssoSession: null,
      ssoStartUrl: null,
      ssoRegion: null,
      newSsoSession: false,
      passwordStore: null,
      production: true,
    };
    const { profileEntry, ssoSessionEntry } = buildProfileEntry(answers);
    expect(profileEntry.auth).toBe("iam-static");
    expect(profileEntry.ssoSession).toBeNull();
    expect(profileEntry.roleName).toBeNull();
    expect(profileEntry.production).toBe(true);
    expect(ssoSessionEntry).toBeNull();
  });

  it("attaches passwordStore to a new ssoSession", () => {
    const answers = {
      name: "p",
      auth: "sso",
      accountId: "123456789012",
      region: "us-east-1",
      roleName: "AdminAccess",
      ssoSession: "my-session",
      ssoStartUrl: "https://example.awsapps.com/start",
      ssoRegion: "us-east-1",
      newSsoSession: true,
      passwordStore: { provider: "1password", account: "my.1password.com", itemId: "abc", vaultId: "def", field: "password" },
      production: false,
    };
    const { profileEntry, ssoSessionEntry } = buildProfileEntry(answers);
    expect(profileEntry.passwordStore).toBeUndefined();
    expect(ssoSessionEntry.passwordStore.provider).toBe("1password");
    expect(ssoSessionEntry.passwordStore.itemId).toBe("abc");
  });
});

// ---- renderAwsConfigStanza ----

describe("renderAwsConfigStanza", () => {
  const ssoAnswers = {
    name: "my-sso",
    auth: "sso",
    accountId: "123456789012",
    region: "us-east-1",
    roleName: "AdminAccess",
    ssoSession: "my-session",
    ssoStartUrl: "https://example.awsapps.com/start",
    ssoRegion: "us-east-1",
  };

  it("renders a new SSO profile stanza with session block", () => {
    const result = renderAwsConfigStanza(ssoAnswers, "");
    expect(result).toContain("[profile my-sso]");
    expect(result).toContain("sso_session = my-session");
    expect(result).toContain("sso_account_id = 123456789012");
    expect(result).toContain("sso_role_name = AdminAccess");
    expect(result).toContain("[sso-session my-session]");
    expect(result).toContain("sso_start_url = https://example.awsapps.com/start");
  });

  it("omits sso-session block when session already in existing config", () => {
    const existing = "[sso-session my-session]\nsso_start_url = https://example.awsapps.com/start\n";
    const result = renderAwsConfigStanza(ssoAnswers, existing);
    expect(result).toContain("[profile my-sso]");
    // Session block should NOT be duplicated
    const sessionCount = (result.match(/\[sso-session my-session\]/g) || []).length;
    expect(sessionCount).toBe(0);
  });

  it("is idempotent: returns empty string when profile already in config", () => {
    const existing = "[profile my-sso]\nregion = us-east-1\n";
    const result = renderAwsConfigStanza(ssoAnswers, existing);
    expect(result).toBe("");
  });

  it("renders iam-static stanza without sso_* lines", () => {
    const iamAnswers = {
      name: "my-iam",
      auth: "iam-static",
      accountId: "123456789012",
      region: "us-west-2",
      roleName: null,
      ssoSession: null,
      ssoStartUrl: null,
    };
    const result = renderAwsConfigStanza(iamAnswers, "");
    expect(result).toContain("[profile my-iam]");
    expect(result).not.toContain("sso_session");
    expect(result).not.toContain("sso_account_id");
    expect(result).toContain("# Add credentials");
  });

  it("iam-static stanza is idempotent when profile already in config", () => {
    const iamAnswers = { name: "my-iam", auth: "iam-static", accountId: "123456789012", region: "us-west-2" };
    const existing = "[profile my-iam]\nregion = us-west-2\n";
    expect(renderAwsConfigStanza(iamAnswers, existing)).toBe("");
  });
});

// ---- mergeIntoConfig ----

describe("mergeIntoConfig", () => {
  const emptyConfig = { profiles: {}, ssoSessions: {} };

  it("adds a new profile to an empty config", () => {
    const profile = { accountId: "123456789012", region: "us-east-1", roleName: null, auth: "iam-static", ssoSession: null };
    const result = mergeIntoConfig(emptyConfig, { profileEntry: profile, ssoSessionEntry: null, name: "p", ssoSessionName: null });
    expect(result.profiles["p"]).toEqual(profile);
  });

  it("adds a new SSO session", () => {
    const profile = { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" };
    const session = { startUrl: "https://x.example.com/start", region: "us-east-1" };
    const result = mergeIntoConfig(emptyConfig, { profileEntry: profile, ssoSessionEntry: session, name: "p", ssoSessionName: "s" });
    expect(result.ssoSessions["s"]).toEqual(session);
  });

  it("overwrites an existing profile with same name", () => {
    const existing = {
      profiles: { p: { accountId: "000000000000", region: "us-west-1", auth: "iam-static", ssoSession: null } },
      ssoSessions: {},
    };
    const newProfile = { accountId: "123456789012", region: "eu-west-1", auth: "iam-static", ssoSession: null };
    const result = mergeIntoConfig(existing, { profileEntry: newProfile, ssoSessionEntry: null, name: "p", ssoSessionName: null });
    expect(result.profiles["p"].region).toBe("eu-west-1");
  });

  it("does not mutate the input config", () => {
    const config = { profiles: {}, ssoSessions: {} };
    const before = JSON.stringify(config);
    mergeIntoConfig(config, { profileEntry: { x: 1 }, ssoSessionEntry: null, name: "p", ssoSessionName: null });
    expect(JSON.stringify(config)).toBe(before);
  });

  it("does not add session when ssoSessionName is null", () => {
    const session = { startUrl: "https://x.example.com/start", region: "us-east-1" };
    const result = mergeIntoConfig(emptyConfig, { profileEntry: {}, ssoSessionEntry: session, name: "p", ssoSessionName: null });
    expect(result.ssoSessions).toEqual({});
  });
});

// ---- registerInteractive ----

describe("registerInteractive", () => {
  it("creates profiles.json for an SSO profile on first run", async () => {
    const prompt = makePrompt([
      "test-profile",        // name
      "sso",                 // auth
      "123456789012",        // accountId
      "us-east-1",           // region
      "AdminAccess",         // roleName
      "my-sso",              // SSO session name (no existing)
      "https://example.awsapps.com/start", // startUrl
      "us-east-1",           // ssoRegion
      "n",                   // passwordStore
    ]);

    const result = await registerInteractive({ home, prompt });
    expect(result.profile).toBe("test-profile");
    expect(result.wrote).toContain(join(home, ".aws-skill", "profiles.json"));

    const raw = readFileSync(join(home, ".aws-skill", "profiles.json"), "utf8");
    const config = JSON.parse(raw);
    // Must be valid per validateConfig
    expect(() => validateConfig(config)).not.toThrow();
    expect(config.profiles["test-profile"].auth).toBe("sso");
    expect(config.profiles["test-profile"].accountId).toBe("123456789012");
    expect(config.ssoSessions["my-sso"].startUrl).toBe("https://example.awsapps.com/start");
  });

  it("creates ~/.aws/config stanza on first run", async () => {
    const prompt = makePrompt([
      "test-profile", "sso", "123456789012", "us-east-1", "AdminAccess",
      "my-sso", "https://example.awsapps.com/start", "us-east-1", "n",
    ]);

    await registerInteractive({ home, prompt });

    const awsConfig = readFileSync(join(home, ".aws", "config"), "utf8");
    expect(awsConfig).toContain("[profile test-profile]");
    expect(awsConfig).toContain("[sso-session my-sso]");
  });

  it("creates iam-static profile with null ssoSession and null roleName", async () => {
    const prompt = makePrompt([
      "iam-profile",         // name
      "iam-static",          // auth
      "123456789013",        // accountId
      "us-west-2",           // region
      // no roleName or passwordStore asked for iam-static
    ]);

    const result = await registerInteractive({ home, prompt });
    expect(result.profile).toBe("iam-profile");

    const raw = readFileSync(join(home, ".aws-skill", "profiles.json"), "utf8");
    const config = JSON.parse(raw);
    expect(() => validateConfig(config)).not.toThrow();
    expect(config.profiles["iam-profile"].auth).toBe("iam-static");
    expect(config.profiles["iam-profile"].ssoSession).toBeNull();
    expect(config.profiles["iam-profile"].roleName).toBeNull();
  });

  it("idempotent: second run with same profile does not duplicate aws/config stanza", async () => {
    // First run
    const prompt1 = makePrompt([
      "test-profile", "sso", "123456789012", "us-east-1", "AdminAccess",
      "my-sso", "https://example.awsapps.com/start", "us-east-1", "n",
    ]);
    await registerInteractive({ home, prompt: prompt1 });

    // Second run: session "my-sso" exists, user reuses it
    const prompt2 = makePrompt([
      "test-profile",        // name
      "sso",                 // auth
      "123456789012",        // accountId
      "us-east-1",           // region
      "AdminAccess",         // roleName
      "my-sso",              // reuse existing session (no passwordStore prompt on reuse)
    ]);
    const result2 = await registerInteractive({ home, prompt: prompt2 });

    const awsConfig = readFileSync(join(home, ".aws", "config"), "utf8");
    // Profile stanza should appear exactly once
    const profileCount = (awsConfig.match(/\[profile test-profile\]/g) || []).length;
    expect(profileCount).toBe(1);
    // Second result should not include aws/config in wrote (stanza already exists)
    expect(result2.wrote).not.toContain(join(home, ".aws", "config"));
  });

  it("works on first run with no prior files at all", async () => {
    const prompt = makePrompt([
      "fresh", "iam-static", "111111111111", "eu-west-1",
    ]);
    const result = await registerInteractive({ home, prompt });
    expect(result.profile).toBe("fresh");
    expect(existsSync(join(home, ".aws-skill", "profiles.json"))).toBe(true);
  });

  it("re-asks accountId on invalid input", async () => {
    const prompt = makePrompt([
      "p",                   // name
      "iam-static",          // auth
      "bad-id",              // invalid accountId (re-asked)
      "123456789012",        // valid accountId
      "us-east-1",           // region
    ]);
    const result = await registerInteractive({ home, prompt });
    expect(result.profile).toBe("p");
    const raw = readFileSync(join(home, ".aws-skill", "profiles.json"), "utf8");
    const config = JSON.parse(raw);
    expect(config.profiles["p"].accountId).toBe("123456789012");
  });

  it("attaches a 1password passwordStore to a new SSO session", async () => {
    const prompt = makePrompt([
      "pw-profile",          // name
      "sso",                 // auth
      "123456789012",        // accountId
      "us-east-1",           // region
      "AdminAccess",         // roleName
      "pw-session",          // SSO session name (no existing)
      "https://example.awsapps.com/start", // startUrl
      "us-east-1",           // ssoRegion
      "y",                   // want passwordStore
      "1password",           // provider
      "my.1password.com",    // account
      "item123",             // itemId
      "vault456",            // vaultId
      "password",            // field
    ]);
    const result = await registerInteractive({ home, prompt });
    const raw = readFileSync(join(home, ".aws-skill", "profiles.json"), "utf8");
    const config = JSON.parse(raw);
    expect(config.profiles["pw-profile"].passwordStore).toBeUndefined();
    expect(config.ssoSessions["pw-session"].passwordStore.provider).toBe("1password");
    expect(config.ssoSessions["pw-session"].passwordStore.itemId).toBe("item123");
    expect(() => validateConfig(config)).not.toThrow();
    expect(result.wrote).toContain(join(home, ".aws-skill", "profiles.json"));
  });
});
