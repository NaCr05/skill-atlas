export type SkillSourceKind =
  | "personal"
  | "system"
  | "plugin"
  | "compatibility";

export type SkillPermission = "manage" | "read-only" | "migration-only";

export type SkillStructureStatus = "valid" | "invalid";

export type SkillEnvironmentStatus =
  | "ready"
  | "unverified"
  | "needs-setup"
  | "blocked";

export type SkillStatus =
  | "usable"
  | "explicit-only"
  | "conditional"
  | "missing-dependency"
  | "invalid-metadata"
  | "duplicate"
  | "internal"
  | "external-unavailable"
  | "unknown";

export interface SkillSource {
  kind: SkillSourceKind;
  label: string;
  rootPath: string;
  permission: SkillPermission;
}

export interface SkillResource {
  path: string;
  kind: "instruction" | "script" | "reference" | "asset" | "agent" | "other";
  size: number;
}

export interface SkillRelationship {
  id: string;
  name: string;
  reason: string;
}

export interface SkillProvenance {
  author: "skill-metadata" | "unknown";
  description: "skill-metadata" | "folder-fallback";
  status: "dashboard-analysis";
  useCases: "dashboard-inference";
  relationships: "dashboard-inference";
  prompt: "agents/openai.yaml" | "dashboard-template";
}

export interface SkillPluginContext {
  channel: string;
  name: string;
  version: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  author?: string;
  plugin?: SkillPluginContext;
  source: SkillSource;
  skillPath: string;
  directoryPath: string;
  modifiedAt?: string;
  status: SkillStatus;
  secondaryStatuses: SkillStatus[];
  structureStatus: SkillStructureStatus;
  environmentStatus: SkillEnvironmentStatus;
  environmentReasons: string[];
  issues: string[];
  allowImplicitInvocation: boolean;
  defaultPrompt?: string;
  instructions: string;
  resources: SkillResource[];
  dependencies: string[];
  missingDependencies: string[];
  requiredTools: string[];
  tags: string[];
  useCases: string[];
  recommendations: string[];
  relationships: SkillRelationship[];
  provenance: SkillProvenance;
}

export interface SkillInventory {
  codexHome: string;
  detectedFrom: "CODEX_HOME" | "user-profile-default";
  scannedAt: string;
  durationMs: number;
  cache: {
    hit: boolean;
    ttlMs: number;
    expiresAt: string;
  };
  sourceRoots: SkillSource[];
  skills: SkillRecord[];
  warnings: string[];
}

export interface ParsedSkill {
  name: string;
  displayName: string;
  description: string;
  author?: string;
  instructions: string;
  metadataValid: boolean;
  issues: string[];
  allowImplicitInvocation: boolean;
  defaultPrompt?: string;
  dependencies: string[];
  requiredTools: string[];
  tags: string[];
  internal: boolean;
}
