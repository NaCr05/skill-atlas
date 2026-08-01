import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { SkillPluginContext } from "./types";

export interface ActivePluginRoot extends SkillPluginContext {
  directoryPath: string;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function configuredPluginIds(configPath: string): Promise<Set<string>> {
  const content = await readFile(configPath, "utf8").catch(() => "");
  const active = new Set<string>();
  let current: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const header = line.match(/^\[plugins\."([^"@]+)@([^"]+)"\]\s*$/);
    if (header) {
      current = `${header[1]}@${header[2]}`.toLocaleLowerCase();
      continue;
    }
    if (line.startsWith("[") && !header) current = undefined;
    if (current && /^enabled\s*=\s*true\s*$/.test(line.trim())) active.add(current);
  }
  return active;
}

async function versionFromManifest(directoryPath: string): Promise<string | undefined> {
  const manifestPath = path.join(directoryPath, ".codex-plugin", "plugin.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
    return typeof manifest.version === "string" && manifest.version.trim()
      ? manifest.version.trim()
      : path.basename(directoryPath);
  } catch {
    return undefined;
  }
}

async function selectActiveVersion(pluginDirectory: string): Promise<{ directoryPath: string; version: string } | undefined> {
  const latest = path.join(pluginDirectory, "latest");
  if (await exists(latest)) {
    const resolved = await realpath(latest).catch(() => latest);
    const version = await versionFromManifest(resolved);
    if (version) return { directoryPath: resolved, version };
  }

  const entries = await readdir(pluginDirectory, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name !== "latest")
    .map(async (entry) => {
      const directoryPath = path.join(pluginDirectory, entry.name);
      const [details, version] = await Promise.all([
        stat(directoryPath).catch(() => null),
        versionFromManifest(directoryPath),
      ]);
      return details && version ? { directoryPath, version, modifiedAt: details.mtimeMs } : undefined;
    }));
  return candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.modifiedAt - a.modifiedAt)[0];
}

export async function findActivePluginRoots(cacheRoot: string, configPath: string): Promise<ActivePluginRoot[]> {
  if (!(await exists(cacheRoot))) return [];
  const configured = await configuredPluginIds(configPath);
  const channels = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  const roots: ActivePluginRoot[] = [];

  for (const channelEntry of channels.filter((entry) => entry.isDirectory())) {
    const channel = channelEntry.name;
    const channelPath = path.join(cacheRoot, channel);
    const plugins = await readdir(channelPath, { withFileTypes: true }).catch(() => []);
    for (const pluginEntry of plugins.filter((entry) => entry.isDirectory())) {
      const name = pluginEntry.name;
      const pluginDirectory = path.join(channelPath, name);
      const configuredId = `${name}@${channel}`.toLocaleLowerCase();
      const remoteMarker = path.join(pluginDirectory, ".codex-remote-plugin-install.json");
      const latestPointer = path.join(pluginDirectory, "latest");
      const active = configured.has(configuredId) || await exists(remoteMarker) || await exists(latestPointer);
      if (!active) continue;
      const selected = await selectActiveVersion(pluginDirectory);
      if (selected) roots.push({ channel, name, ...selected });
    }
  }

  return roots;
}
