import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, lstatSync, readlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, skillPaths, skillSource } from "../src/installer.js";

function buildTestEnv() {
  const home = mkdtempSync(join(tmpdir(), "aws-skill-"));
  const { skillDir, skillLink } = skillPaths(home);
  return { home, skillDir, skillLink };
}

function installedPaths(home) {
  const result = run({ home });
  const { skillDir, skillLink } = skillPaths(home);
  return { ...result, skillDir, skillLink };
}

let env;
beforeEach(() => { env = buildTestEnv(); });
afterEach(() => { rmSync(env.home, { recursive: true, force: true }); });

describe("install.sh", () => {
  it("exits 0 and creates a symlink at ~/.claude/skills/aws/SKILL.md", () => {
    const { status, skillLink } = installedPaths(env.home);
    expect(status).toBe(0);
    expect(lstatSync(skillLink).isSymbolicLink()).toBe(true);
  });

  it("points the symlink at this repo's SKILL.md", () => {
    const { skillLink } = installedPaths(env.home);
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("prints the install confirmation line", () => {
    const { stdout } = installedPaths(env.home);
    expect(stdout).toContain("Installed /aws ->");
  });

  it("is idempotent: a second install still leaves a correct symlink", () => {
    installedPaths(env.home);
    const { status, skillLink } = installedPaths(env.home);
    expect(status).toBe(0);
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("overwrites a pre-existing wrong symlink (ln -sfn behavior)", () => {
    const { skillDir, skillLink } = env;
    mkdirSync(skillDir, { recursive: true });
    installedPaths(env.home);
    writeFileSync(join(env.home, "stale"), "x");
    installedPaths(env.home);
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("uninstall removes the symlink and exits 0", () => {
    installedPaths(env.home);
    const { status, stdout } = run({ home: env.home, uninstall: true });
    const { skillLink } = env;
    expect(status).toBe(0);
    expect(stdout).toContain("Uninstalled /aws");
    expect(() => lstatSync(skillLink)).toThrow();
  });

  it("uninstall is a safe no-op when nothing is installed", () => {
    const { status, stdout } = run({ home: env.home, uninstall: true });
    expect(status).toBe(0);
    expect(stdout).toContain("Nothing to uninstall");
  });
});
