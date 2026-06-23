import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, loadConfig, validateConfig, listProfiles } from "../src/config.js";

let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-cfg-test-"));
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

function writeConfig(home, obj) {
  const dir = join(home, ".aws-skill");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "profiles.json"), JSON.stringify(obj));
}

const VALID_SSO_CONFIG = {
  profiles: {
    "my-sso": {
      accountId: "123456789012",
      region: "us-east-1",
      roleName: "AdminAccess",
      auth: "sso",
      ssoSession: "my-session",
      passwordStore: null,
    },
  },
  ssoSessions: {
    "my-session": {
      startUrl: "https://example.awsapps.com/start",
      region: "us-east-1",
    },
  },
};

const VALID_IAM_CONFIG = {
  profiles: {
    "my-iam": {
      accountId: "123456789012",
      region: "us-east-2",
      roleName: null,
      auth: "iam-static",
      ssoSession: null,
      passwordStore: null,
    },
  },
  ssoSessions: {},
};

describe("configPath", () => {
  it("returns path under home/.aws-skill/profiles.json", () => {
    expect(configPath("/home/user")).toBe("/home/user/.aws-skill/profiles.json");
  });
});

describe("loadConfig", () => {
  it("loads and parses a valid config", () => {
    writeConfig(home, VALID_SSO_CONFIG);
    const config = loadConfig(home);
    expect(config.profiles["my-sso"].accountId).toBe("123456789012");
  });

  it("throws with 'No config found' on ENOENT", () => {
    expect(() => loadConfig(home)).toThrow(/No config found at.*aws-skill register/);
  });

  it("error message includes the missing path", () => {
    const path = configPath(home);
    expect(() => loadConfig(home)).toThrow(path);
  });

  it("throws 'Invalid JSON' on syntax error", () => {
    const dir = join(home, ".aws-skill");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profiles.json"), "{ not valid json }");
    expect(() => loadConfig(home)).toThrow(/Invalid JSON in/);
  });

  it("defaults production to false if absent", () => {
    const cfg = {
      profiles: {
        "p": { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" },
      },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    writeConfig(home, cfg);
    const result = loadConfig(home);
    expect(result.profiles["p"].production).toBe(false);
  });
});

describe("validateConfig", () => {
  it("returns a valid SSO config unchanged", () => {
    const result = validateConfig(VALID_SSO_CONFIG);
    expect(result.profiles["my-sso"].accountId).toBe("123456789012");
  });

  it("returns a valid iam-static config unchanged", () => {
    const result = validateConfig(VALID_IAM_CONFIG);
    expect(result.profiles["my-iam"].auth).toBe("iam-static");
  });

  it("defaults profiles to {} when absent", () => {
    const result = validateConfig({ ssoSessions: {} });
    expect(result.profiles).toEqual({});
  });

  it("defaults ssoSessions to {} when absent", () => {
    const result = validateConfig({ profiles: {} });
    expect(result.ssoSessions).toEqual({});
  });

  it("throws on bad accountId (not 12 digits)", () => {
    const bad = {
      profiles: { p: { accountId: "123", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/accountId must be a 12-digit string/);
  });

  it("throws on non-numeric accountId", () => {
    const bad = {
      profiles: { p: { accountId: "abcdefghijkl", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/accountId/);
  });

  it("throws on empty region", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/region must be a non-empty string/);
  });

  it("throws on invalid auth value", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "magic", ssoSession: null } },
      ssoSessions: {},
    };
    expect(() => validateConfig(bad)).toThrow(/auth must be "sso" or "iam-static"/);
  });

  it("throws when sso profile has empty roleName", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/roleName must be a non-empty string/);
  });

  it("allows null roleName for iam-static", () => {
    const result = validateConfig(VALID_IAM_CONFIG);
    expect(result.profiles["my-iam"].roleName).toBeNull();
  });

  it("throws on sso profile with missing ssoSession", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "" } },
      ssoSessions: {},
    };
    expect(() => validateConfig(bad)).toThrow(/sso auth requires/);
  });

  it("throws when ssoSession references unknown session", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "missing" } },
      ssoSessions: {},
    };
    expect(() => validateConfig(bad)).toThrow(/references unknown ssoSession 'missing'/);
  });

  it("throws when iam-static profile has non-null ssoSession", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: null, auth: "iam-static", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/iam-static auth must have null ssoSession/);
  });

  it("allows null passwordStore", () => {
    const result = validateConfig(VALID_SSO_CONFIG);
    expect(result.profiles["my-sso"].passwordStore).toBeNull();
  });

  it("throws when passwordStore has empty provider", () => {
    const bad = {
      profiles: {
        p: {
          accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s",
          passwordStore: { provider: "" },
        },
      },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/passwordStore.provider must be a non-empty string/);
  });

  it("accepts non-1password provider with only provider field", () => {
    const cfg = {
      profiles: {
        p: {
          accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s",
          passwordStore: { provider: "keychain" },
        },
      },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it("throws when 1password passwordStore is missing itemId", () => {
    const bad = {
      profiles: {
        p: {
          accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s",
          passwordStore: { provider: "1password", account: "my.1password.com", itemId: "", vaultId: "v", field: "password" },
        },
      },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/passwordStore.itemId must be a non-empty string/);
  });

  it("accepts valid 1password passwordStore", () => {
    const cfg = {
      profiles: {
        p: {
          accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s",
          passwordStore: { provider: "1password", account: "my.1password.com", itemId: "abc", vaultId: "def", field: "password" },
        },
      },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it("throws on ssoSession with non-https startUrl", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "http://not-secure.example.com/start", region: "us-east-1" } },
    };
    expect(() => validateConfig(bad)).toThrow(/startUrl must start with https/);
  });

  it("throws on ssoSession with empty region", () => {
    const bad = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "" } },
    };
    expect(() => validateConfig(bad)).toThrow(/ssoSession.*region must be a non-empty string/);
  });

  it("defaults production to false when absent", () => {
    const cfg = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s" } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    const result = validateConfig(cfg);
    expect(result.profiles["p"].production).toBe(false);
  });

  it("preserves production: true", () => {
    const cfg = {
      profiles: { p: { accountId: "123456789012", region: "us-east-1", roleName: "Admin", auth: "sso", ssoSession: "s", production: true } },
      ssoSessions: { s: { startUrl: "https://x.example.com/start", region: "us-east-1" } },
    };
    const result = validateConfig(cfg);
    expect(result.profiles["p"].production).toBe(true);
  });

  it("does not mutate the input object", () => {
    const cfg = { profiles: {}, ssoSessions: {} };
    validateConfig(cfg);
    expect(cfg).toEqual({ profiles: {}, ssoSessions: {} });
  });
});

describe("listProfiles", () => {
  it("returns profile names from the config", () => {
    const result = validateConfig(VALID_SSO_CONFIG);
    expect(listProfiles(result)).toEqual(["my-sso"]);
  });

  it("returns empty array when no profiles", () => {
    const result = validateConfig({});
    expect(listProfiles(result)).toEqual([]);
  });

  it("returns multiple profile names", () => {
    const cfg = {
      profiles: {
        a: { accountId: "123456789012", region: "us-east-1", roleName: null, auth: "iam-static", ssoSession: null, passwordStore: null },
        b: { accountId: "123456789013", region: "us-west-2", roleName: null, auth: "iam-static", ssoSession: null, passwordStore: null },
      },
      ssoSessions: {},
    };
    const result = validateConfig(cfg);
    expect(listProfiles(result)).toEqual(["a", "b"]);
  });
});
