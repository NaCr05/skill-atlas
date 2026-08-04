import { expect, test } from "@playwright/test";

test("batch issues, upstream checks, and operation recovery share one review-first center", async ({ page, context }) => {
  await context.addCookies([{ name: "skill-atlas-language", value: "en", domain: "127.0.0.1", path: "/" }]);
  const issues = {
    scannedAt: "2026-08-04T00:00:00.000Z",
    total: 2,
    duplicateCount: 1,
    missingDependencyCount: 1,
    issues: [
      {
        id: "duplicate",
        kind: "duplicate-entry",
        severity: "warning",
        title: "sample has two entries",
        affectedSkills: [
          { id: "personal", name: "sample", displayName: "Sample", source: "Personal", directoryPath: "C:/fixture/.codex/skills/sample" },
          { id: "compat", name: "sample", displayName: "Sample", source: "Agents", directoryPath: "C:/fixture/.agents/skills/sample" },
        ],
        canonicalSkillId: "personal",
        migrationCandidateIds: ["compat"],
        suggestions: ["Keep Personal as the preferred entry.", "Review compatibility entries one by one."],
      },
      {
        id: "dependency",
        kind: "missing-dependency",
        severity: "blocked",
        title: "consumer is missing peer-skill",
        affectedSkills: [{ id: "consumer", name: "consumer", displayName: "Consumer", source: "Personal", directoryPath: "C:/fixture/.codex/skills/consumer" }],
        missingDependencies: ["peer-skill"],
        migrationCandidateIds: [],
        suggestions: ["Search the Skill marketplace for peer-skill."],
      },
    ],
  };
  const updates = {
    checkedAt: "2026-08-04T01:00:00.000Z",
    trackedCount: 1,
    updateCount: 1,
    failedCount: 0,
    records: [{ skillId: "personal", skillName: "sample", status: "update-available", checkedAt: "2026-08-04T01:00:00.000Z", sourceUrl: "https://github.com/acme/skills/tree/main/skills/sample", revision: "tree-v2" }],
  };
  const archives = {
    rootPath: "C:/fixture/.codex/.skill-atlas/migrations",
    count: 1,
    totalBytes: 120,
    records: [{
      migrationId: "archived-copy", skillId: "compat", skillName: "sample",
      originalDirectory: "C:/fixture/.agents/skills/sample",
      archivedDirectory: "C:/fixture/.codex/.skill-atlas/migrations/archived-copy/skill",
      migratedAt: "2026-08-04T00:30:00.000Z",
      fingerprint: { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 2, totalBytes: 120, complete: true },
      health: "ready", restorable: true, purgeAllowed: true,
    }],
  };
  await page.route("**/api/issues", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(issues) }));
  await page.route("**/api/issues/migrations", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archives) }));
  await page.route("**/api/updates/batch", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updates) }));
  await page.route("**/api/operations/stream", (route) => route.abort());
  await page.route("**/api/operations", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ records: [{
    id: "operation", kind: "update", status: "interrupted", target: "sample", startedAt: "2026-08-04T01:00:00.000Z", errorCode: "OPERATION_INTERRUPTED", detail: "Previous runtime stopped.", recoveryHref: "/trash",
  }] }) }));
  await page.route("**/api/issues/migrate/inspect", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    planId: "migration-plan", expiresAt: "2026-08-04T02:00:00.000Z", skillId: "compat", skillName: "sample",
    sourceDirectory: "C:/fixture/.agents/skills/sample", sourceLabel: "Agents", canonicalDirectory: "C:/fixture/.codex/skills/sample",
    archiveRoot: "C:/fixture/.codex/.skill-atlas/migrations", fingerprint: { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 2, totalBytes: 120, complete: true },
    migrationAllowed: true, risks: [{ level: "info", title: "Complete archive", detail: "The complete directory is retained." }],
  }) }));
  await page.route("**/api/issues/migrate/confirm", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    migrationId: "migration", skillName: "sample", originalDirectory: "C:/fixture/.agents/skills/sample", archivedDirectory: "C:/fixture/.codex/.skill-atlas/migrations/migration/skill", migratedAt: "2026-08-04T01:10:00.000Z", fileCount: 2, totalBytes: 120,
  }) }));
  await page.route("**/api/updates/inspect", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    previewId: "6f6221a2-d76a-471d-94ee-6708c8c8f000", expiresAt: "2026-08-04T02:00:00.000Z",
    skillId: "personal", skillName: "sample", status: "update-available", previewOnly: false, updateAllowed: true, trackingAvailable: false,
    source: { sourceUrl: "https://github.com/acme/skills/tree/main/skills/sample", repository: "acme/skills", ref: "main", sourceDirectory: "skills/sample", revision: "tree-v2" },
    local: { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 1, totalBytes: 100, complete: true },
    upstream: { algorithm: "sha256-manifest-v1", value: "b".repeat(64), fileCount: 1, totalBytes: 110, complete: true },
    localDiverged: false,
    summary: { added: 0, modified: 1, removed: 0, unchanged: 0 },
    changes: [{ path: "SKILL.md", kind: "modified", localSize: 100, upstreamSize: 110 }],
    risks: [{ level: "info", code: "transactional-update", title: "Transactional update", detail: "A complete backup is retained." }],
  }) }));
  await page.route("**/api/updates/confirm", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    transactionId: "update-transaction", skillId: "personal", skillName: "sample", updatedDirectory: "C:/fixture/.codex/skills/sample", backupDirectory: "C:/fixture/.codex/.skill-atlas/backups/update-transaction", previousFingerprint: { algorithm: "sha256-manifest-v1", value: "a".repeat(64), fileCount: 1, totalBytes: 100, complete: true }, installedFingerprint: { algorithm: "sha256-manifest-v1", value: "b".repeat(64), fileCount: 1, totalBytes: 110, complete: true }, revision: "tree-v2", updatedAt: "2026-08-04T01:30:00.000Z", rollbackAvailable: true,
  }) }));

  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: /Operations Center/ })).toBeVisible();
  await expect(page.getByText("Updates found").locator("..").getByText("1")).toBeVisible();
  for (const checkbox of await page.locator(".issue-grid input[type=checkbox]").all()) {
    await checkbox.check();
  }
  await page.getByRole("button", { name: "Build review queue (2)" }).click();
  await expect(page.getByRole("link", { name: /Search and repair peer-skill/ })).toHaveAttribute("href", "/marketplace?q=peer-skill&repairIssue=dependency&consumer=consumer&dependency=peer-skill");

  const migrationTrigger = page.getByRole("button", { name: "Review duplicate migration" });
  await migrationTrigger.click();
  const dialog = page.getByRole("dialog", { name: /Migrate duplicate compatibility entry/ });
  await expect(dialog).toBeFocused();
  await expect(dialog.getByText("C:/fixture/.codex/.skill-atlas/migrations")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm migration" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Check all upstreams" }).click();
  await expect(page.getByText("Update available")).toBeVisible();
  await page.locator(".update-check-list input[type=checkbox]").check();
  await page.getByRole("button", { name: "Review and update (1)" }).click();
  const updateDialog = page.getByRole("dialog", { name: "Safe update queue" });
  await expect(updateDialog.getByText("SKILL.md")).toBeVisible();
  await updateDialog.getByRole("checkbox").check();
  await updateDialog.getByRole("button", { name: "Update and continue" }).click();
  await expect(updateDialog.getByText("Update review queue complete")).toBeVisible();
  await updateDialog.getByRole("button", { name: "Finish and refresh" }).click();
  await expect(page.getByText("Failed or interrupted").locator("..").getByText("1")).toBeVisible();
  await expect(page.getByText("Interrupted", { exact: true })).toBeVisible();
  await expect(page.getByText("Fingerprint verified")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore original location" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recovery" })).toHaveAttribute("href", "/trash");
});

for (const scenario of [
  { name: "resolved", remaining: [] as string[], expected: "Issue resolved: peer-skill is now available." },
  { name: "remaining", remaining: ["second-peer"], expected: "Rescan complete, but still missing: second-peer." },
]) {
  test(`dependency repair automatically rescans and reports ${scenario.name} status`, async ({ page, context }) => {
    await context.addCookies([{ name: "skill-atlas-language", value: "en", domain: "127.0.0.1", path: "/" }]);
    await page.route("**/api/marketplace/skillsmp**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      provider: "skillsmp", available: true, browseUrl: "https://skillsmp.com/search?q=peer-skill", results: [{
        id: "peer-skill", name: "peer-skill", description: "Dependency fixture.", sourceLabel: "SkillsMP",
        sourceUrl: "https://github.com/acme/skills/tree/main/peer-skill", pageUrl: "https://skillsmp.com/peer-skill",
      }],
    }) }));
    await page.route("**/api/install/inspect", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      planId: "7f6221a2-d76a-471d-94ee-6708c8c8f000", expiresAt: new Date(Date.now() + 60_000).toISOString(),
      sourceUrl: "https://github.com/acme/skills/tree/main/peer-skill", repository: "acme/skills", ref: "main", revision: "tree-peer", sourceDirectory: "peer-skill", skillName: "peer-skill", description: "Dependency fixture.", targetDirectory: "C:/fixture/.codex/skills/peer-skill",
      fingerprint: { algorithm: "sha256-manifest-v1", value: "c".repeat(64), fileCount: 1, totalBytes: 100, complete: true }, files: [{ path: "SKILL.md", size: 100 }], totalBytes: 100,
      risks: [{ level: "info", title: "Reviewed source", detail: "The source is locked to this review." }], installAllowed: true,
    }) }));
    await page.route("**/api/install/confirm", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      skillName: "peer-skill", targetDirectory: "C:/fixture/.codex/skills/peer-skill", fileCount: 1, totalBytes: 100, verifiedFiles: ["SKILL.md"], sourceTracking: "recorded",
    }) }));
    await page.route("**/api/issues?force=1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      scannedAt: "2026-08-04T03:00:00.000Z", total: scenario.remaining.length ? 1 : 0, duplicateCount: 0, missingDependencyCount: scenario.remaining.length ? 1 : 0,
      issues: scenario.remaining.length ? [{
        id: "dependency-after-rescan", kind: "missing-dependency", severity: "blocked", title: "consumer still has missing dependencies",
        affectedSkills: [{ id: "consumer-id", name: "consumer", displayName: "Consumer", source: "Personal", directoryPath: "C:/fixture/.codex/skills/consumer" }],
        missingDependencies: scenario.remaining, migrationCandidateIds: [], suggestions: [],
      }] : [],
    }) }));

    await page.goto("/marketplace?q=peer-skill&repairIssue=dependency&consumer=consumer&dependency=peer-skill");
    const input = page.getByPlaceholder(/frontend design/);
    await expect(input).toHaveValue("peer-skill");
    await page.getByRole("button", { name: "Search marketplace" }).click();
    await page.getByRole("button", { name: "Review and install" }).click();
    const dialog = page.getByRole("dialog", { name: /peer-skill/ });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Confirm and install complete directory" }).click();
    await expect(page.locator(".installation-success").getByText(scenario.expected)).toBeVisible();
  });
}
