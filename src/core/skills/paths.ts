import os from "node:os";
import path from "node:path";

import type { SkillSource } from "./types";

export interface CodexEnvironment {
  codexHome: string;
  detectedFrom: "CODEX_HOME" | "user-profile-default";
  sources: SkillSource[];
}

export function resolveCodexEnvironment(
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
  homeDirectory = os.homedir(),
): CodexEnvironment {
  const configuredHome = env.CODEX_HOME?.trim();
  const useConfigured = Boolean(configuredHome && path.isAbsolute(configuredHome));
  const codexHome = path.resolve(
    useConfigured ? (configuredHome as string) : path.join(homeDirectory, ".codex"),
  );
  const userProfile = path.resolve(env.USERPROFILE || homeDirectory);
  const localAppData = path.resolve(
    env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local"),
  );

  return {
    codexHome,
    detectedFrom: useConfigured ? "CODEX_HOME" : "user-profile-default",
    sources: [
      {
        kind: "personal",
        label: "个人 Codex Skills",
        rootPath: path.join(codexHome, "skills"),
        permission: "manage",
      },
      {
        kind: "system",
        label: "Codex 系统 Skills",
        rootPath: path.join(codexHome, "skills", ".system"),
        permission: "read-only",
      },
      {
        kind: "plugin",
        label: "插件附带 Skills",
        rootPath: path.join(codexHome, "plugins", "cache"),
        permission: "read-only",
      },
      {
        kind: "compatibility",
        label: "Agents 兼容目录",
        rootPath: path.join(userProfile, ".agents", "skills"),
        permission: "migration-only",
      },
      {
        kind: "compatibility",
        label: "Skill Manager 共享目录",
        rootPath: path.join(localAppData, "skill-manager", "shared"),
        permission: "migration-only",
      },
    ],
  };
}

export function resolvePersonalSkillsRoot(
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
  homeDirectory = os.homedir(),
): string {
  return resolveCodexEnvironment(env, homeDirectory).sources[0].rootPath;
}

export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.toLocaleLowerCase().startsWith(
      `${resolvedRoot.toLocaleLowerCase()}${path.sep}`,
    )
  );
}
