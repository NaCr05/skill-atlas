import { mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inspectLifecycleRecovery } from "@/core/lifecycle/reconcile";
import { executeRecoveryAction } from "@/core/lifecycle/recovery-actions";
import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import {
  confirmPermanentDeletion,
  confirmSkillRemoval,
  inspectPermanentDeletion,
  inspectSkillRemoval,
  permanentDeletionPlans,
  removalPlans,
} from "@/core/lifecycle/skill-trash";
import type { LifecycleTransaction } from "@/core/lifecycle/types";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];

async function createSkill(root: string, name: string): Promise<void> {
  const directory = path.join(root, name);
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Recovery fixture.\n---\n\nUse safely.`,
  );
  await writeFile(path.join(directory, "assets", "note.txt"), "supporting file");
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  removalPlans.clear();
  permanentDeletionPlans.clear();
  invalidateSkillInventoryCache();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("lifecycle reconciliation and audit integrity", () => {
  it("surfaces corrupt trash, orphaned quarantine, and failed transaction records", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-reconcile-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "orphaned-quarantine");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "orphaned-quarantine")!;
    const removalReview = await inspectSkillRemoval(
      { skillId: skill.id },
      { env, homeDirectory: temporary },
    );
    const removed = await confirmSkillRemoval(removalReview.planId, {
      env,
      homeDirectory: temporary,
    });

    const atlasRoot = path.join(codexHome, ".skill-atlas");
    const quarantineDirectory = path.join(
      atlasRoot,
      "purge",
      "55555555-5555-4555-8555-555555555555",
    );
    await mkdir(path.dirname(quarantineDirectory), { recursive: true });
    await rename(path.dirname(removed.trashDirectory), quarantineDirectory);

    const corruptTrashDirectory = path.join(
      atlasRoot,
      "trash",
      "66666666-6666-4666-8666-666666666666",
    );
    await mkdir(corruptTrashDirectory, { recursive: true });
    await writeFile(path.join(corruptTrashDirectory, "manifest.json"), "{not-json");

    const failedTransaction: LifecycleTransaction = {
      id: "77777777-7777-4777-8777-777777777777",
      operation: "restore",
      skillId: skill.id,
      skillName: skill.name,
      state: "failed",
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:01:00.000Z",
      expectedFingerprint: "e".repeat(64),
      failure: "simulated recovery failure",
    };
    await mkdir(path.join(atlasRoot, "transactions"), { recursive: true });
    await writeFile(
      path.join(atlasRoot, "transactions", failedTransaction.id + ".json"),
      JSON.stringify(failedTransaction),
    );

    const recovery = await inspectLifecycleRecovery({
      env,
      homeDirectory: temporary,
      now: new Date("2026-08-04T04:00:00.000Z"),
    });
    expect(recovery.healthy).toBe(false);
    expect(recovery.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "trash-manifest-invalid",
      "purge-quarantine-intact",
      "transaction-failed",
    ]));
    expect(recovery.counts).toMatchObject({ trash: 1, quarantine: 1, transactions: 1 });
    expect(recovery.issues.find((entry) => entry.code === "purge-quarantine-intact"))
      .toMatchObject({ recoverability: "safe-restore", skillName: "orphaned-quarantine" });

    const quarantineIssue = recovery.issues.find((entry) => entry.code === "purge-quarantine-intact")!;
    await executeRecoveryAction(
      { issueId: quarantineIssue.id, action: "restore-quarantine" },
      { env, homeDirectory: temporary },
    );
    expect(await exists(path.join(atlasRoot, "trash", removed.trashId, "skill"))).toBe(true);
    expect(await exists(quarantineDirectory)).toBe(false);
  });

  it("cleans only a revalidated orphan staging directory", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-recovery-staging-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const orphan = path.join(codexHome, ".skill-atlas", "staging", "11111111-1111-4111-8111-111111111111");
    await mkdir(path.join(orphan, "skill"), { recursive: true });
    await writeFile(path.join(orphan, "skill", "partial.txt"), "leftover");
    await utimes(orphan, new Date(0), new Date(0));
    const recovery = await inspectLifecycleRecovery({ env, homeDirectory: temporary });
    const issue = recovery.issues.find((entry) => entry.code === "staging-entry-orphaned")!;
    expect(issue.availableActions).toContain("clean-staging");
    await executeRecoveryAction({ issueId: issue.id, action: "clean-staging" }, { env, homeDirectory: temporary });
    expect(await exists(orphan)).toBe(false);
  });

  it("retries a failed update transaction by restoring its verified backup", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-recovery-update-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const transactionId = "22222222-2222-4222-8222-222222222222";
    const original = path.join(codexHome, "skills", "sample");
    const backup = path.join(codexHome, ".skill-atlas", "backups", transactionId, "skill");
    const manifest = path.join(path.dirname(backup), "manifest.json");
    await mkdir(backup, { recursive: true });
    await writeFile(path.join(backup, "SKILL.md"), "---\nname: sample\ndescription: Verified backup.\n---\n\nUse it.");
    await writeFile(manifest, JSON.stringify({ trackingRecord: {
      skillDirectory: "sample",
      sourceUrl: "https://github.com/acme/skills/tree/main/skills/sample",
      repository: "acme/skills",
      ref: "main",
      sourceDirectory: "skills/sample",
      revision: "tree-v2",
      upstreamFingerprint: "f".repeat(64),
      localFingerprint: "f".repeat(64),
      trackedAt: "2026-08-04T00:00:00.000Z",
    } }));
    const expected = (await snapshotLocalSkill(backup)).fingerprint.value;
    const transaction: LifecycleTransaction = {
      id: transactionId, operation: "update", skillId: "personal:sample", skillName: "sample",
      state: "failed", createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:01:00.000Z",
      expectedFingerprint: expected, targetFingerprint: "f".repeat(64), originalDirectory: original,
      backupDirectory: backup, manifestPath: manifest, failure: "process exited after backup",
    };
    const journal = path.join(codexHome, ".skill-atlas", "transactions", `${transactionId}.json`);
    await mkdir(path.dirname(journal), { recursive: true });
    await writeFile(journal, JSON.stringify(transaction));
    const recovery = await inspectLifecycleRecovery({ env, homeDirectory: temporary });
    const issue = recovery.issues.find((entry) => entry.transactionId === transactionId)!;
    expect(issue.availableActions).toContain("retry-transaction");
    const result = await executeRecoveryAction({ issueId: issue.id, action: "retry-transaction" }, { env, homeDirectory: temporary });
    expect(result.outcome).toBe("rolled-back");
    expect(await readFile(path.join(original, "SKILL.md"), "utf8")).toContain("Verified backup");
    expect(JSON.parse(await readFile(journal, "utf8"))).toMatchObject({ state: "rolled-back" });
  });

  it("reports deletion as audit-incomplete when the final committed journal cannot be written", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-purge-audit-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "audit-gap");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "audit-gap")!;
    const removalReview = await inspectSkillRemoval(
      { skillId: skill.id },
      { env, homeDirectory: temporary },
    );
    const removed = await confirmSkillRemoval(removalReview.planId, {
      env,
      homeDirectory: temporary,
    });
    const purgeReview = await inspectPermanentDeletion(
      { trashId: removed.trashId },
      { env, homeDirectory: temporary },
    );
    const transactionDirectory = path.join(codexHome, ".skill-atlas", "transactions");
    const transactionWriter = async (transaction: LifecycleTransaction) => {
      if (transaction.state === "committed") {
        throw new Error("simulated final audit failure");
      }
      await mkdir(transactionDirectory, { recursive: true });
      await writeFile(
        path.join(transactionDirectory, transaction.id + ".json"),
        JSON.stringify(transaction),
      );
    };

    const result = await confirmPermanentDeletion(
      { planId: purgeReview.planId, confirmationText: purgeReview.confirmationText },
      {
        env,
        homeDirectory: temporary,
        now: new Date("2026-08-04T02:00:00.000Z"),
        idFactory: () => "88888888-8888-4888-8888-888888888888",
        transactionWriter,
      },
    );
    expect(result).toMatchObject({
      auditStatus: "incomplete",
      auditTransactionId: "88888888-8888-4888-8888-888888888888",
      recoverable: false,
    });
    expect(result.auditWarning).toContain("simulated final audit failure");
    expect(await exists(path.dirname(removed.trashDirectory))).toBe(false);

    const recovery = await inspectLifecycleRecovery({
      env,
      homeDirectory: temporary,
      now: new Date(Date.now() + 3 * 60_000),
    });
    expect(recovery.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "transaction-incomplete",
        transactionId: result.auditTransactionId,
        state: "staged",
      }),
    ]));
  });
});
