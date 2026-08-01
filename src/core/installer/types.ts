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
  sourceDirectory: string;
  skillName: string;
  description: string;
  targetDirectory: string;
  files: Array<{ path: string; size: number }>;
  totalBytes: number;
  risks: InstallRisk[];
  installAllowed: boolean;
}

export interface InstallationResult {
  skillName: string;
  targetDirectory: string;
  fileCount: number;
  totalBytes: number;
  verifiedFiles: string[];
}

export interface GitTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  size?: number;
  url: string;
}

export interface InternalInstallPlan extends InstallationReview {
  owner: string;
  repo: string;
  entries: GitTreeEntry[];
}
