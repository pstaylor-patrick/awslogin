import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, lstatSync, readlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, skillPaths, skillSource } from "../src/installer.js";

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
    run({ home });
    writeFileSync(join(home, "stale"), "x");
    run({ home });
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
