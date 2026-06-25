import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

export const installScript = join(repoRoot, "install.rb");
export const skillSource = join(repoRoot, "SKILL.md");
export const cliSource = join(repoRoot, "bin", "aws-skill");

export function cliPaths(home) {
  return { binDir: join(home, "bin"), cliLink: join(home, "bin", "aws-skill") };
}

export function skillPaths(home) {
  const skillDir = join(home, ".claude", "skills", "aws");
  return { skillDir, skillLink: join(skillDir, "SKILL.md") };
}

export function run({ home, uninstall = false }) {
  const args = uninstall ? ["--uninstall"] : [];
  const result = spawnSync("ruby", [installScript, ...args], {
    env: { ...process.env, HOME: home },
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
