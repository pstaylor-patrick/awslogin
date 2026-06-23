import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, lstatSync, readlinkSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, skillPaths, skillSource, cliPaths, cliSource } from "../src/installer.js";

let home, skillLink;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "aws-skill-"));
  skillLink = skillPaths(home).skillLink;
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe("install.sh", () => {
  it("exits 0 and creates a symlink at ~/.claude/skills/aws/SKILL.md", () => {
    const { status } = run({ home });
    expect(status).toBe(0);
    expect(lstatSync(skillLink).isSymbolicLink()).toBe(true);
  });

  it("points the symlink at this repo's SKILL.md", () => {
    run({ home });
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("prints the install confirmation line", () => {
    const { stdout } = run({ home });
    expect(stdout).toContain("Installed /aws ->");
  });

  it("is idempotent: a second install still leaves a correct symlink", () => {
    run({ home });
    const { status } = run({ home });
    expect(status).toBe(0);
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("overwrites a pre-existing wrong symlink (ln -sfn behavior)", () => {
    const { skillDir } = skillPaths(home);
    mkdirSync(skillDir, { recursive: true });
    const stale = join(home, "stale");
    writeFileSync(stale, "x");
    symlinkSync(stale, skillLink);
    const { status } = run({ home });
    expect(status).toBe(0);
    expect(readlinkSync(skillLink)).toBe(skillSource);
  });

  it("uninstall removes the symlink and exits 0", () => {
    run({ home });
    const { status, stdout } = run({ home, uninstall: true });
    expect(status).toBe(0);
    expect(stdout).toContain("Uninstalled /aws");
    expect(() => lstatSync(skillLink)).toThrow();
  });

  it("uninstall is a safe no-op when nothing is installed", () => {
    const { status, stdout } = run({ home, uninstall: true });
    expect(status).toBe(0);
    expect(stdout).toContain("Nothing to uninstall");
  });
});

describe("install.sh CLI symlink", () => {
  it("install creates symlink at ~/bin/aws-skill pointing at cliSource", () => {
    run({ home });
    const { cliLink } = cliPaths(home);
    expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(cliLink)).toBe(cliSource);
  });

  it("install creates ~/bin/ if it does not exist", () => {
    const { binDir, cliLink } = cliPaths(home);
    // binDir should not exist yet
    expect(() => lstatSync(binDir)).toThrow();
    run({ home });
    expect(lstatSync(binDir).isDirectory()).toBe(true);
    expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
  });

  it("stdout contains 'Installed aws-skill CLI ->'", () => {
    const { stdout } = run({ home });
    expect(stdout).toContain("Installed aws-skill CLI ->");
  });

  it("uninstall removes the CLI symlink", () => {
    run({ home });
    const { cliLink } = cliPaths(home);
    expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
    run({ home, uninstall: true });
    expect(() => lstatSync(cliLink)).toThrow();
  });

  it("idempotent second install leaves correct CLI symlink", () => {
    run({ home });
    run({ home });
    const { cliLink } = cliPaths(home);
    expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(cliLink)).toBe(cliSource);
  });
});
