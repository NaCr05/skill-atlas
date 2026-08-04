import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPathInside, resolveCodexEnvironment, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import type { SkillSourceTracking, TrackedSkillSource } from "./types";

interface SourceRegistryDocument {
  version: 1;
  entries: TrackedSkillSource[];
}

export interface SourceRegistryOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
}

let registryWriteQueue = Promise.resolve();

function normalizedKey(skillDirectory: string): string {
  return skillDirectory.replaceAll("\\", "/").toLocaleLowerCase();
}

function validTrackedSource(value: unknown): value is TrackedSkillSource {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TrackedSkillSource>;
  const fieldsValid = [
    entry.skillDirectory,
    entry.sourceUrl,
    entry.repository,
    entry.ref,
    entry.sourceDirectory,
    entry.revision,
    entry.upstreamFingerprint,
    entry.localFingerprint,
    entry.trackedAt,
  ].every((field) => typeof field === "string" && field.length > 0);
  if (!fieldsValid || !entry.skillDirectory) return false;
  const normalizedDirectory = path.posix.normalize(entry.skillDirectory.replaceAll("\\", "/"));
  return normalizedDirectory === entry.skillDirectory.replaceAll("\\", "/")
    && normalizedDirectory !== "."
    && !normalizedDirectory.startsWith("../")
    && !path.posix.isAbsolute(normalizedDirectory);
}

function registryLocation(options: SourceRegistryOptions): string {
  const environment = resolveCodexEnvironment(options.env, options.homeDirectory);
  const location = path.join(environment.codexHome, ".skill-atlas", "source-registry.json");
  if (!isPathInside(environment.codexHome, location)) throw new Error("来源注册表路径超出 CODEX_HOME。");
  return location;
}

export function skillDirectoryKey(directoryPath: string, options: SourceRegistryOptions = {}): string {
  const skillsRoot = resolvePersonalSkillsRoot(options.env, options.homeDirectory);
  const resolvedDirectory = path.resolve(directoryPath);
  if (!isPathInside(skillsRoot, resolvedDirectory) || resolvedDirectory === path.resolve(skillsRoot)) {
    throw new Error("仅个人 Skills 目录可以记录上游来源。");
  }
  const relative = path.relative(skillsRoot, resolvedDirectory).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
    throw new Error("Skill 来源键无效。");
  }
  return relative;
}

export async function readSourceRegistry(
  options: SourceRegistryOptions = {},
): Promise<Map<string, TrackedSkillSource>> {
  try {
    const parsed = JSON.parse(await readFile(registryLocation(options), "utf8")) as Partial<SourceRegistryDocument>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return new Map();
    return new Map(
      parsed.entries
        .filter(validTrackedSource)
        .map((entry) => [normalizedKey(entry.skillDirectory), entry]),
    );
  } catch {
    return new Map();
  }
}

async function writeSourceRegistry(
  registry: Map<string, TrackedSkillSource>,
  options: SourceRegistryOptions,
): Promise<void> {
  const document: SourceRegistryDocument = {
    version: 1,
    entries: [...registry.values()].sort((left, right) => left.skillDirectory.localeCompare(right.skillDirectory)),
  };
  const location = registryLocation(options);
  const temporary = `${location}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(location), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, location);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function sourceTrackingForDirectory(
  directoryPath: string,
  options: SourceRegistryOptions = {},
  registry?: Map<string, TrackedSkillSource>,
): Promise<SkillSourceTracking> {
  const key = skillDirectoryKey(directoryPath, options);
  const tracked = (registry || await readSourceRegistry(options)).get(normalizedKey(key));
  return tracked ? { status: "tracked", ...tracked } : { status: "untracked" };
}

export async function recordTrackedSource(
  entry: TrackedSkillSource,
  options: SourceRegistryOptions = {},
): Promise<void> {
  registryWriteQueue = registryWriteQueue.catch(() => undefined).then(async () => {
    const registry = await readSourceRegistry(options);
    registry.set(normalizedKey(entry.skillDirectory), entry);
    await writeSourceRegistry(registry, options);
  });
  await registryWriteQueue;
}

export async function mergeTrackedSources(
  imported: unknown[],
  options: SourceRegistryOptions = {},
): Promise<number> {
  const entries = imported.filter(validTrackedSource);
  registryWriteQueue = registryWriteQueue.catch(() => undefined).then(async () => {
    const registry = await readSourceRegistry(options);
    for (const entry of entries) registry.set(normalizedKey(entry.skillDirectory), entry);
    await writeSourceRegistry(registry, options);
  });
  await registryWriteQueue;
  return entries.length;
}

export async function removeTrackedSource(
  directoryPath: string,
  options: SourceRegistryOptions = {},
): Promise<TrackedSkillSource | undefined> {
  let removed: TrackedSkillSource | undefined;
  registryWriteQueue = registryWriteQueue.catch(() => undefined).then(async () => {
    const key = normalizedKey(skillDirectoryKey(directoryPath, options));
    const registry = await readSourceRegistry(options);
    removed = registry.get(key);
    if (!removed) return;
    registry.delete(key);
    await writeSourceRegistry(registry, options);
  });
  await registryWriteQueue;
  return removed;
}
