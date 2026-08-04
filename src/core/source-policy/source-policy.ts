import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { GithubSourceTrust } from "@/core/github/skill-source";
import type { InstallRisk } from "@/core/installer/types";
import { resolveLifecycleStorageRoots, type LifecycleStorageOptions } from "@/core/lifecycle/storage";
import { writeJsonAtomically } from "@/core/lifecycle/transaction-store";

const policySchema = z.object({
  version: z.literal(1),
  trustedOwners: z.array(z.string().min(1).max(100)).max(200),
  trustedRepositories: z.array(z.string().min(3).max(220)).max(300),
  trustMode: z.enum(["advisory", "require"]),
  licenseMode: z.enum(["advisory", "allow-list"]),
  allowedLicenses: z.array(z.string().min(1).max(80)).max(100),
  warnArchived: z.boolean(),
  updatedAt: z.string().datetime().optional(),
});

export type SourcePolicy = z.infer<typeof policySchema>;
export type SourcePolicyUpdate = Omit<SourcePolicy, "version" | "updatedAt">;

export interface SourcePolicyEvaluation {
  trusted: boolean;
  trustMatch: "repository" | "owner" | "none";
  licenseAllowed: boolean;
  licenseStatus: "allowed" | "unlisted" | "unknown";
  archivedWarning: boolean;
  sourceLocked: boolean;
  blocked: boolean;
  risks: InstallRisk[];
}

const defaultPolicy: SourcePolicy = {
  version: 1,
  trustedOwners: [],
  trustedRepositories: [],
  trustMode: "advisory",
  licenseMode: "advisory",
  allowedLicenses: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"],
  warnArchived: true,
};

function location(options: LifecycleStorageOptions): string { return path.join(resolveLifecycleStorageRoots(options).atlasRoot, "source-policy.json"); }
const normalized = (value: string) => value.trim().toLocaleLowerCase();

export async function loadSourcePolicy(options: LifecycleStorageOptions = {}): Promise<SourcePolicy> {
  try {
    const parsed = policySchema.safeParse(JSON.parse(await readFile(location(options), "utf8")));
    return parsed.success ? parsed.data : defaultPolicy;
  } catch { return defaultPolicy; }
}

export async function saveSourcePolicy(update: SourcePolicyUpdate, options: LifecycleStorageOptions = {}): Promise<SourcePolicy> {
  const policy = policySchema.parse({
    version: 1,
    ...update,
    trustedOwners: [...new Set(update.trustedOwners.map(normalized).filter(Boolean))],
    trustedRepositories: [...new Set(update.trustedRepositories.map(normalized).filter((value) => value.includes("/")))],
    allowedLicenses: [...new Set(update.allowedLicenses.map((value) => value.trim()).filter(Boolean))],
    updatedAt: new Date().toISOString(),
  });
  await mkdir(path.dirname(location(options)), { recursive: true });
  await writeJsonAtomically(location(options), policy);
  return policy;
}

export function evaluateSourcePolicy(trust: GithubSourceTrust, policy: SourcePolicy): SourcePolicyEvaluation {
  const repository = normalized(trust.lock.repository);
  const owner = normalized(trust.repositoryOwner);
  const repositoryTrusted = policy.trustedRepositories.includes(repository);
  const ownerTrusted = policy.trustedOwners.includes(owner);
  const trusted = repositoryTrusted || ownerTrusted;
  const licenseStatus = !trust.licenseSpdx ? "unknown" : policy.allowedLicenses.some((license) => normalized(license) === normalized(trust.licenseSpdx!)) ? "allowed" : "unlisted";
  const risks: InstallRisk[] = [];
  if (!trusted && (policy.trustedOwners.length || policy.trustedRepositories.length)) risks.push({ level: policy.trustMode === "require" ? "blocked" : "review", title: "来源不在信任名单", detail: `${trust.lock.repository} 未匹配可信仓库或作者。` });
  if (policy.licenseMode === "allow-list" && licenseStatus !== "allowed") risks.push({ level: "blocked", title: "许可证策略不允许此来源", detail: trust.licenseSpdx ? `${trust.licenseSpdx} 不在许可证允许名单中。` : "GitHub 未返回可识别的 SPDX 许可证。" });
  if (policy.warnArchived && trust.archived) risks.push({ level: "review", title: "上游仓库已归档", detail: "上游仓库处于只读状态，可能不再获得维护或安全更新。" });
  return {
    trusted, trustMatch: repositoryTrusted ? "repository" : ownerTrusted ? "owner" : "none",
    licenseAllowed: licenseStatus === "allowed", licenseStatus,
    archivedWarning: Boolean(policy.warnArchived && trust.archived), sourceLocked: Boolean(trust.lock.revision && trust.lock.fingerprint),
    blocked: risks.some((risk) => risk.level === "blocked"), risks,
  };
}
