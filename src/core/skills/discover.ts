import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { readSourceRegistry } from "@/core/lifecycle/source-registry";
import type { TrackedSkillSource } from "@/core/lifecycle/types";
import { parseSkillDocument } from "./parse";
import { resolveCodexEnvironment } from "./paths";
import { findActivePluginRoots } from "./plugins";
import { inferSkillRelationships } from "./relationships";
import type {
  CodexEnvironment,
} from "./paths";
import type {
  ParsedSkill,
  SkillInventory,
  SkillPluginContext,
  SkillRecord,
  SkillResource,
  SkillSource,
  SkillStatus,
} from "./types";

const INVENTORY_CACHE_TTL_MS = 30_000;
const inventoryCache = new Map<string, { inventory: SkillInventory; expiresAt: number }>();
const pendingScans = new Map<string, Promise<SkillInventory>>();

const SCRIPT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".js",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".ts",
]);

function skillId(source: SkillSource, directoryPath: string): string {
  return createHash("sha256")
    .update(`${source.kind}:${path.resolve(directoryPath).toLocaleLowerCase()}`)
    .digest("hex")
    .slice(0, 18);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directSkillDirectories(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== ".system")
      .map(async (entry) => {
        const candidate = path.join(root, entry.name);
        return (await exists(path.join(candidate, "SKILL.md"))) ? candidate : null;
      }),
  );
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

async function recursiveSkillDirectories(
  root: string,
  maxDepth = 9,
  maxCandidates = 2_500,
): Promise<string[]> {
  if (!(await exists(root))) return [];
  const found: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [
    { directory: root, depth: 0 },
  ];

  while (queue.length && found.length < maxCandidates) {
    const current = queue.shift();
    if (!current) break;
    let entries;
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      found.push(current.directory);
      continue;
    }
    if (current.depth >= maxDepth) continue;
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        ![".git", ".next", "node_modules"].includes(entry.name)
      ) {
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1,
        });
      }
    }
  }
  return found;
}

function resourceKind(relativePath: string): SkillResource["kind"] {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized === "SKILL.md") return "instruction";
  if (normalized.startsWith("scripts/") || SCRIPT_EXTENSIONS.has(path.extname(normalized))) {
    return "script";
  }
  if (normalized.startsWith("references/")) return "reference";
  if (normalized.startsWith("assets/")) return "asset";
  if (normalized.startsWith("agents/")) return "agent";
  return "other";
}

function initialStatus(parsed: ParsedSkill): SkillStatus {
  if (!parsed.metadataValid) return "invalid-metadata";
  if (parsed.internal) return "internal";
  if (!parsed.allowImplicitInvocation) return "explicit-only";
  if (parsed.requiredTools.length) return "conditional";
  return "usable";
}

function inferUseCases(parsed: ParsedSkill): string[] {
  const clauses = parsed.description
    .split(/[.;。；]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 10)
    .slice(0, 3);
  return clauses.length
    ? clauses
    : [`需要 ${parsed.displayName} 所描述的专门流程时`];
}

function inferRecommendations(parsed: ParsedSkill, source: SkillSource): string[] {
  const recommendations = [
    `任务与“${parsed.description.slice(0, 72)}”直接相关时优先调用`,
  ];
  if (!parsed.allowImplicitInvocation) {
    recommendations.push("该 Skill 需要显式点名，建议使用详情页生成的 Prompt");
  }
  if (source.permission !== "manage") {
    recommendations.push("此来源为只读或兼容目录，不应从控制面板直接修改");
  }
  return recommendations;
}

async function loadSkill(
  source: SkillSource,
  directoryPath: string,
  plugin?: SkillPluginContext,
  trackedSources?: Map<string, TrackedSkillSource>,
): Promise<SkillRecord> {
  const skillPath = path.join(directoryPath, "SKILL.md");
  const [content, agentConfig, localSnapshot, fileStat] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(path.join(directoryPath, "agents", "openai.yaml"), "utf8").catch(
      () => undefined,
    ),
    snapshotLocalSkill(directoryPath, { maxFiles: 500 }),
    stat(skillPath).catch(() => null),
  ]);
  const parsed = parseSkillDocument(content, path.basename(directoryPath), agentConfig);
  const resources: SkillResource[] = localSnapshot.files.slice(0, 300).map((file) => ({
    path: file.path,
    kind: resourceKind(file.path),
    size: file.size,
  }));
  const trackedKey = path.relative(source.rootPath, directoryPath).replaceAll("\\", "/").toLocaleLowerCase();
  const trackedSource = source.kind === "personal" ? trackedSources?.get(trackedKey) : undefined;
  return {
    id: skillId(source, directoryPath),
    name: parsed.name,
    displayName: parsed.displayName,
    description: parsed.description,
    author: parsed.author,
    plugin,
    source,
    skillPath,
    directoryPath,
    modifiedAt:
      fileStat && fileStat.mtimeMs >= Date.UTC(2000, 0, 1)
        ? fileStat.mtime.toISOString()
        : undefined,
    fingerprint: localSnapshot.fingerprint,
    sourceTracking: source.kind === "personal"
      ? trackedSource ? { status: "tracked", ...trackedSource } : { status: "untracked" }
      : { status: "not-applicable" },
    status: initialStatus(parsed),
    secondaryStatuses: [],
    structureStatus: parsed.metadataValid ? "valid" : "invalid",
    environmentStatus: !parsed.metadataValid
      ? "blocked"
      : parsed.requiredTools.length
        ? "unverified"
        : "ready",
    environmentReasons: !parsed.metadataValid
      ? ["元数据异常，无法验证运行环境"]
      : parsed.requiredTools.length
        ? [`声明了外部工具，需在 Codex 会话中确认：${parsed.requiredTools.join("、")}`]
        : [],
    issues: [...parsed.issues],
    allowImplicitInvocation: parsed.allowImplicitInvocation,
    defaultPrompt: parsed.defaultPrompt,
    instructions: parsed.instructions,
    resources,
    dependencies: parsed.dependencies,
    referencedSkills: parsed.referencedSkills,
    missingDependencies: [],
    requiredTools: parsed.requiredTools,
    tags: parsed.tags,
    useCases: inferUseCases(parsed),
    recommendations: inferRecommendations(parsed, source),
    relationships: [],
    provenance: {
      author: parsed.author ? "skill-metadata" : "unknown",
      description: parsed.description === "该 Skill 没有提供描述。" ? "folder-fallback" : "skill-metadata",
      status: "dashboard-analysis",
      useCases: "dashboard-inference",
      relationships: "dashboard-inference",
      prompt: parsed.defaultPrompt ? "agents/openai.yaml" : "dashboard-template",
    },
  };
}

function sourceRank(source: SkillSource): number {
  return { personal: 0, system: 1, plugin: 2, compatibility: 3 }[source.kind];
}

function classifyInventory(skills: SkillRecord[]): void {
  const names = new Set(skills.map((skill) => skill.name.toLocaleLowerCase()));
  for (const skill of skills) {
    skill.referencedSkills = skill.referencedSkills.filter(
      (reference) => names.has(reference.toLocaleLowerCase()),
    );
    skill.missingDependencies = skill.dependencies.filter(
      (dependency) => !names.has(dependency.toLocaleLowerCase()),
    );
    if (skill.missingDependencies.length) {
      if (skill.status !== "invalid-metadata") skill.secondaryStatuses.push(skill.status);
      skill.status = "missing-dependency";
      skill.environmentStatus = "needs-setup";
      skill.environmentReasons.push(`缺少必需 Skill：${skill.missingDependencies.join("、")}`);
    }
  }

  const grouped = new Map<string, SkillRecord[]>();
  for (const skill of skills) {
    const key = skill.name.toLocaleLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), skill]);
  }
  for (const duplicates of grouped.values()) {
    if (duplicates.length < 2) continue;
    duplicates.sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
    duplicates[0].secondaryStatuses.push("duplicate");
    duplicates[0].issues.push(`发现 ${duplicates.length - 1} 个同名入口`);
    for (const duplicate of duplicates.slice(1)) {
      if (duplicate.status !== "duplicate") duplicate.secondaryStatuses.push(duplicate.status);
      duplicate.status = "duplicate";
      duplicate.issues.push(`同名入口优先使用：${duplicates[0].directoryPath}`);
    }
  }

  const relationships = inferSkillRelationships(skills);
  for (const skill of skills) skill.relationships = relationships.get(skill.id) || [];
}

export interface DiscoverSkillsOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  forceRefresh?: boolean;
}

function environmentCacheKey(environment: CodexEnvironment): string {
  return environment.sources.map((source) => source.rootPath.toLocaleLowerCase()).join("|");
}

function inventoryWithCacheState(inventory: SkillInventory, hit: boolean, expiresAt: number): SkillInventory {
  return {
    ...inventory,
    cache: { hit, ttlMs: INVENTORY_CACHE_TTL_MS, expiresAt: new Date(expiresAt).toISOString() },
  };
}

async function scanSkills(environment: CodexEnvironment): Promise<SkillInventory> {
  const startedAt = performance.now();
  const warnings: string[] = [];
  const trackedSources = await readSourceRegistry({ env: { CODEX_HOME: environment.codexHome } });

  const candidateGroups = await Promise.all(
    environment.sources.map(async (source) => {
      if (!(await exists(source.rootPath))) {
        warnings.push(`未找到来源目录：${source.rootPath}`);
      }
      if (source.kind !== "plugin") {
        const directories = await directSkillDirectories(source.rootPath);
        return directories.map((directoryPath) => ({ source, directoryPath, plugin: undefined }));
      }
      const activeRoots = await findActivePluginRoots(
        source.rootPath,
        path.join(environment.codexHome, "config.toml"),
      );
      const pluginDirectories = await Promise.all(activeRoots.map(async (plugin) => ({
        plugin,
        directories: await recursiveSkillDirectories(plugin.directoryPath),
      })));
      return pluginDirectories.flatMap(({ plugin, directories }) => directories.map((directoryPath) => ({
        source,
        directoryPath,
        plugin: { channel: plugin.channel, name: plugin.name, version: plugin.version },
      })));
    }),
  );

  const settled = await Promise.allSettled(
    candidateGroups.flat().map(({ source, directoryPath, plugin }) => loadSkill(source, directoryPath, plugin, trackedSources)),
  );
  const skills: SkillRecord[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") skills.push(result.value);
    else warnings.push(`Skill 读取失败：${String(result.reason)}`);
  }

  classifyInventory(skills);
  skills.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "zh-CN", { sensitivity: "base" }),
  );

  const expiresAt = Date.now() + INVENTORY_CACHE_TTL_MS;
  return {
    codexHome: environment.codexHome,
    detectedFrom: environment.detectedFrom,
    scannedAt: new Date().toISOString(),
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    cache: { hit: false, ttlMs: INVENTORY_CACHE_TTL_MS, expiresAt: new Date(expiresAt).toISOString() },
    sourceRoots: environment.sources,
    skills,
    warnings,
  };
}

export function invalidateSkillInventoryCache(options?: Omit<DiscoverSkillsOptions, "forceRefresh">): void {
  if (!options) {
    inventoryCache.clear();
    return;
  }
  const environment = resolveCodexEnvironment(options.env, options.homeDirectory);
  inventoryCache.delete(environmentCacheKey(environment));
}

export async function discoverSkills(options: DiscoverSkillsOptions = {}): Promise<SkillInventory> {
  const environment = resolveCodexEnvironment(options.env, options.homeDirectory);
  const key = environmentCacheKey(environment);
  const now = Date.now();
  const cached = inventoryCache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > now) {
    return inventoryWithCacheState(cached.inventory, true, cached.expiresAt);
  }
  if (!options.forceRefresh && pendingScans.has(key)) {
    const pending = await pendingScans.get(key);
    if (pending) return inventoryWithCacheState(pending, true, Date.now() + INVENTORY_CACHE_TTL_MS);
  }

  const scan = scanSkills(environment);
  pendingScans.set(key, scan);
  try {
    const inventory = await scan;
    const expiresAt = Date.now() + INVENTORY_CACHE_TTL_MS;
    const stored = inventoryWithCacheState(inventory, false, expiresAt);
    inventoryCache.set(key, { inventory: stored, expiresAt });
    return stored;
  } finally {
    pendingScans.delete(key);
  }
}

export async function findSkillById(id: string): Promise<SkillRecord | undefined> {
  const inventory = await discoverSkills();
  return inventory.skills.find((skill) => skill.id === id);
}
