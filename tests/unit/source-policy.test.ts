import { describe, expect, it } from "vitest";

import { evaluateSourcePolicy, type SourcePolicy } from "@/core/source-policy/source-policy";
import type { GithubSourceTrust } from "@/core/github/skill-source";

const trust: GithubSourceTrust = {
  repositoryOwner: "openai", licenseSpdx: "MIT", archived: false, activity: "active", versionSummary: "abc · 2 files",
  lock: { repository: "openai/skills", ref: "main", revision: "abc", fingerprint: "sha" },
};
const policy: SourcePolicy = { version: 1, trustedOwners: [], trustedRepositories: ["openai/skills"], trustMode: "require", licenseMode: "allow-list", allowedLicenses: ["MIT"], warnArchived: true };

describe("source policy", () => {
  it("accepts a repository and license on strict allowlists", () => {
    expect(evaluateSourcePolicy(trust, policy)).toMatchObject({ trusted: true, trustMatch: "repository", licenseAllowed: true, sourceLocked: true, blocked: false });
  });
  it("blocks an unlisted repository and unknown license in strict mode", () => {
    const result = evaluateSourcePolicy({ ...trust, repositoryOwner: "someone", licenseSpdx: undefined, lock: { ...trust.lock, repository: "someone/repo" } }, policy);
    expect(result.blocked).toBe(true);
    expect(result.risks.filter((risk) => risk.level === "blocked")).toHaveLength(2);
  });
  it("warns when a tracked source repository is archived", () => {
    const result = evaluateSourcePolicy({ ...trust, archived: true }, policy);
    expect(result.archivedWarning).toBe(true);
    expect(result.risks.some((risk) => risk.title === "上游仓库已归档")).toBe(true);
  });
});
