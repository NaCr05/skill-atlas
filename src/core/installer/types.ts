import type { SkillFingerprint } from "@/core/lifecycle/types";

export type RiskLevel = "info" | "review" | "blocked";

export interface InstallRisk {
  level: RiskLevel;
  title: string;
  detail: string;
}

export interface InstallationReview {
  planId: string;
  expiresAt: string;
  sourceUrl: string;
  repository: string;
  ref: string;
  revision: string;
  fingerprint: SkillFingerprint;
  sourceDirectory: string;
  skillName: string;
  description: string;
  targetDirectory: string;
  files: Array<{ path: string; size: number }>;
  totalBytes: number;
  risks: InstallRisk[];
  installAllowed: boolean;
  sourceTrust: import("@/core/github/skill-source").GithubSourceTrust;
  sourcePolicy: import("@/core/source-policy/source-policy").SourcePolicyEvaluation;
}

export interface InstallationResult {
  skillName: string;
  targetDirectory: string;
  fileCount: number;
  totalBytes: number;
  verifiedFiles: string[];
  sourceTracking: "recorded" | "failed";
}

export type { GitTreeEntry } from "@/core/github/skill-source";

export interface InternalInstallPlan extends InstallationReview {
  owner: string;
  repo: string;
  entries: import("@/core/github/skill-source").GitTreeEntry[];
}
