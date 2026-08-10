import { homedir } from "node:os";
import { join } from "node:path";

export function awsConfigPath(home = homedir()) {
  return join(home, ".aws", "config");
}

export function parseIni(text) {
  const sections = {};
  let current = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const header = trimmed.match(/^\[(.+)\]$/);
    if (header) {
      const name = header[1].trim();
      sections[name] ??= {};
      current = sections[name];
      continue;
    }
    if (!current) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    current[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return sections;
}

// One `aws sso login` refreshes every profile sharing an sso_session, so the unit
// of work is the session, not the profile. Profiles with the legacy inline sso_*
// keys have no session to share and each need their own login.
export function loginTargets(text) {
  const bySession = new Map();
  const targets = [];
  for (const [section, values] of Object.entries(parseIni(text))) {
    let profile;
    if (section === "default") profile = "default";
    else if (section.startsWith("profile ")) profile = section.slice("profile ".length).trim();
    else continue;

    if (values.sso_session) {
      const existing = bySession.get(values.sso_session);
      if (existing) {
        existing.profiles.push(profile);
        continue;
      }
      const target = { session: values.sso_session, profile, profiles: [profile] };
      bySession.set(values.sso_session, target);
      targets.push(target);
    } else if (values.sso_start_url) {
      targets.push({ session: null, profile, profiles: [profile] });
    }
  }
  return targets;
}

export function describeTarget(target) {
  const label = target.session ? `sso-session ${target.session}` : `profile ${target.profile}`;
  return `${label}: ${target.profiles.join(", ")}`;
}
