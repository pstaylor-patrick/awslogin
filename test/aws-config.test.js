import { describe, expect, it } from "vitest";
import { awsConfigPath, describeTarget, loginTargets, parseIni } from "../src/aws-config.js";

const sample = `
[sso-session personal-sso]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1

# a comment
[profile personal]
sso_session = personal-sso
sso_account_id = 000000000000
region = us-east-1

[profile j2j]
sso_session = personal-sso
sso_account_id = 000000000001

[profile servant]
sso_session = servant-sso

[profile legacy]
sso_start_url = https://legacy.awsapps.com/start
sso_account_id = 000000000002

[profile static-creds]
region = us-west-2
`;

describe("parseIni", () => {
  it("keys sections by their full header name", () => {
    const sections = parseIni(sample);
    expect(Object.keys(sections)).toContain("sso-session personal-sso");
    expect(Object.keys(sections)).toContain("profile personal");
  });

  it("reads key = value pairs into the enclosing section", () => {
    expect(parseIni(sample)["sso-session personal-sso"]).toEqual({
      sso_start_url: "https://example.awsapps.com/start",
      sso_region: "us-east-1"
    });
  });

  it("keeps everything after the first = in the value", () => {
    expect(parseIni("[profile p]\nsso_start_url = https://x/start?a=b\n")["profile p"].sso_start_url)
      .toBe("https://x/start?a=b");
  });

  it("ignores comments, blank lines, keyless lines, and text before any section", () => {
    expect(parseIni("stray = 1\n\n; semi\n[profile p]\nnoequals\nregion = us-east-1\n")).toEqual({
      "profile p": { region: "us-east-1" }
    });
  });

  it("merges a section header that appears twice", () => {
    expect(parseIni("[profile p]\na = 1\n[profile p]\nb = 2\n")["profile p"]).toEqual({ a: "1", b: "2" });
  });
});

describe("loginTargets", () => {
  it("groups profiles sharing an sso_session into one login", () => {
    expect(loginTargets(sample)[0]).toEqual({
      session: "personal-sso",
      profile: "personal",
      profiles: ["personal", "j2j"]
    });
  });

  it("includes sessions that have no [sso-session] block of their own", () => {
    expect(loginTargets(sample).map((t) => t.session)).toContain("servant-sso");
  });

  it("gives legacy inline sso profiles their own target", () => {
    expect(loginTargets(sample)).toContainEqual({
      session: null,
      profile: "legacy",
      profiles: ["legacy"]
    });
  });

  it("skips profiles with no sso configuration", () => {
    expect(loginTargets(sample).flatMap((t) => t.profiles)).not.toContain("static-creds");
  });

  it("treats the default section as a profile", () => {
    expect(loginTargets("[default]\nsso_session = s\n")).toEqual([
      { session: "s", profile: "default", profiles: ["default"] }
    ]);
  });

  it("returns nothing for a config with no sso profiles", () => {
    expect(loginTargets("[profile p]\nregion = us-east-1\n")).toEqual([]);
  });
});

describe("describeTarget", () => {
  it("labels a session target with the profiles it covers", () => {
    expect(describeTarget({ session: "personal-sso", profile: "personal", profiles: ["personal", "j2j"] }))
      .toBe("sso-session personal-sso: personal, j2j");
  });

  it("labels a sessionless target by profile", () => {
    expect(describeTarget({ session: null, profile: "legacy", profiles: ["legacy"] }))
      .toBe("profile legacy: legacy");
  });
});

describe("awsConfigPath", () => {
  it("resolves ~/.aws/config under the given home", () => {
    expect(awsConfigPath("/home/pst")).toBe("/home/pst/.aws/config");
  });

  it("defaults to the current user's home", () => {
    expect(awsConfigPath()).toMatch(/\/\.aws\/config$/);
  });
});
