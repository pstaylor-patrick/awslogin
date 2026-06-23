import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const installScript = resolve(here, "..", "install.sh");
export const skillSource = resolve(here, "..", "SKILL.md");

export function skillPaths(home) {
  const skillDir = join(home, ".claude", "skills", "aws");
  return { skillDir, skillLink: join(skillDir, "SKILL.md") };
}

export function run({ home, uninstall = false }) {
  const args = uninstall ? ["--uninstall"] : [];
  const result = spawnSync("bash", [installScript, ...args], {
    env: { ...process.env, HOME: home },
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
