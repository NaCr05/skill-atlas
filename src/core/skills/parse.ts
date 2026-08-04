import { parse as parseYaml } from "yaml";

import type { ParsedSkill } from "./types";

type UnknownRecord = Record<string, unknown>;

const ENCODING_ARTIFACTS = ["\uFFFD", "â€", "â€™", "â€œ", "â€�", "â€“", "â€”", "Ã©", "Ã¨", "Ã¼", "Ã¶", "Ã¤", "Â "];

function hasEncodingArtifacts(text: string): boolean {
  return ENCODING_ARTIFACTS.some((artifact) => text.includes(artifact));
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dependencyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      const record = asRecord(entry);
      const name = typeof record.name === "string"
        ? record.name
        : typeof record.target === "string"
          ? record.target
          : "";
      return name.trim();
    })
    .filter(Boolean);
}

function withoutFencedCode(markdown: string): string {
  let fenceCharacter = "";
  let fenceLength = 0;

  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1];
        if (!fenceCharacter) {
          fenceCharacter = marker[0];
          fenceLength = marker.length;
        } else if (marker[0] === fenceCharacter && marker.length >= fenceLength) {
          fenceCharacter = "";
          fenceLength = 0;
        }
        return "";
      }
      return fenceCharacter ? "" : line;
    })
    .join("\n");
}

function uniqueSkillNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitFrontmatter(content: string): {
  metadata: UnknownRecord;
  body: string;
  error?: string;
} {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) {
    return { metadata: {}, body: normalized.trim(), error: "缺少 YAML frontmatter" };
  }

  try {
    return {
      metadata: asRecord(parseYaml(match[1])),
      body: normalized.slice(match[0].length).trim(),
    };
  } catch (error) {
    return {
      metadata: {},
      body: normalized.slice(match[0].length).trim(),
      error: `YAML 无法解析：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}

export function parseSkillDocument(
  content: string,
  folderName: string,
  agentConfigContent?: string,
): ParsedSkill {
  const { metadata, body, error } = splitFrontmatter(content);
  const issues = error ? [error] : [];
  const rawName = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const rawDescription =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const descriptionHasEncodingArtifacts = hasEncodingArtifacts(rawDescription);

  if (!rawName) issues.push("frontmatter 缺少 name");
  if (!rawDescription) issues.push("frontmatter 缺少 description");
  if (hasEncodingArtifacts(content)) issues.push("SKILL.md 包含异常编码字符；请将文件重新保存为 UTF-8 后再扫描");

  let agentConfig: UnknownRecord = {};
  if (agentConfigContent) {
    try {
      agentConfig = asRecord(parseYaml(agentConfigContent));
    } catch (agentError) {
      issues.push(
        `agents/openai.yaml 无法解析：${agentError instanceof Error ? agentError.message : "未知错误"}`,
      );
    }
  }

  const interfaceConfig = asRecord(agentConfig.interface);
  const policyConfig = asRecord(agentConfig.policy);
  const dependenciesConfig = asRecord(metadata.dependencies);
  const agentDependencies = asRecord(agentConfig.dependencies);
  const toolEntries = Array.isArray(agentDependencies.tools)
    ? agentDependencies.tools
    : [];
  const requiredTools = toolEntries
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = asRecord(entry);
      return typeof record.target === "string"
        ? record.target
        : typeof record.name === "string"
          ? record.name
          : "";
    })
    .filter(Boolean);

  const explicitDependencies = uniqueSkillNames([
    ...dependencyNames(dependenciesConfig.skills),
    ...dependencyNames(agentDependencies.skills),
  ]);
  const mentionedSkills = Array.from(
    withoutFencedCode(body).matchAll(/\$([a-z][a-z0-9-]{1,63})\b/g),
    (match) => match[1],
  );
  const tags = [
    ...stringArray(metadata.tags),
    ...stringArray(metadata.categories),
  ];
  const allowImplicit = policyConfig.allow_implicit_invocation;
  const legacyDisable = metadata["disable-model-invocation"];
  const internal =
    metadata.internal === true ||
    metadata["user-invocable"] === false ||
    folderName.startsWith("_");

  return {
    name: rawName || folderName,
    displayName:
      (typeof interfaceConfig.display_name === "string" &&
        interfaceConfig.display_name.trim()) ||
      rawName ||
      folderName,
    description: descriptionHasEncodingArtifacts
      ? "该 Skill 的描述包含异常编码字符；请将 SKILL.md 重新保存为 UTF-8 后再扫描。"
      : rawDescription || "该 Skill 没有提供描述。",
    author:
      typeof metadata.author === "string" && metadata.author.trim()
        ? metadata.author.trim()
        : undefined,
    instructions: body,
    metadataValid: issues.length === 0,
    issues,
    allowImplicitInvocation:
      typeof allowImplicit === "boolean"
        ? allowImplicit
        : legacyDisable === true
          ? false
          : true,
    defaultPrompt:
      typeof interfaceConfig.default_prompt === "string" &&
      interfaceConfig.default_prompt.trim()
        ? interfaceConfig.default_prompt.trim()
        : undefined,
    dependencies: explicitDependencies.filter(
      (dependency) => dependency.toLocaleLowerCase() !== rawName.toLocaleLowerCase(),
    ),
    referencedSkills: uniqueSkillNames([
      ...stringArray(metadata.related_skills),
      ...mentionedSkills,
    ]).filter((reference) =>
      reference.toLocaleLowerCase() !== rawName.toLocaleLowerCase()
      && !explicitDependencies.some(
        (dependency) => dependency.toLocaleLowerCase() === reference.toLocaleLowerCase(),
      ),
    ),
    requiredTools,
    tags: Array.from(new Set(tags)),
    internal,
  };
}
