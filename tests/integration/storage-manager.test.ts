import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { resolveLifecycleStorageRoots } from "@/core/lifecycle/storage";
import { confirmStorageCleanup, inspectManagedStorage, inspectStorageCleanup } from "@/core/storage/storage-manager";

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("backup and archive manager", () => {
  it("lists only verified final update backups and cleans them through a one-use exact-name review", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-storage-"));
    temporaryDirectories.push(temporary);
    const options = { env: { CODEX_HOME: path.join(temporary, ".codex"), USERPROFILE: temporary }, homeDirectory: temporary };
    const roots = resolveLifecycleStorageRoots(options);
    const id = "backup-1";
    const container = path.join(roots.backupRoot, id);
    const skill = path.join(container, "skill");
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, "SKILL.md"), "---\nname: sample-skill\ndescription: sample\n---\n");
    const snapshot = await snapshotLocalSkill(skill);
    await writeFile(path.join(container, "manifest.json"), JSON.stringify({ transactionId: id, skillId: "sample", skillName: "sample-skill", previousFingerprint: snapshot.fingerprint.value }));
    await mkdir(roots.transactionRoot, { recursive: true });
    await writeFile(path.join(roots.transactionRoot, `${id}.json`), JSON.stringify({ id, operation: "update", skillId: "sample", state: "committed", createdAt: new Date().toISOString(), expectedFingerprint: snapshot.fingerprint.value }));

    const overview = await inspectManagedStorage(options);
    expect(overview.updateBackups).toHaveLength(1);
    expect(overview.updateBackups[0]).toMatchObject({ cleanupAllowed: true, skillName: "sample-skill" });
    const review = await inspectStorageCleanup("update-backup", id, options);
    await expect(confirmStorageCleanup({ planId: review.planId, confirmationText: "wrong" }, options)).rejects.toMatchObject({ code: "STORAGE_CONFIRMATION_MISMATCH" });
    const fresh = await inspectStorageCleanup("update-backup", id, options);
    const result = await confirmStorageCleanup({ planId: fresh.planId, confirmationText: "sample-skill" }, { ...options, idFactory: () => "purge-1" });
    expect(result).toMatchObject({ recoverable: false, totalBytes: snapshot.fingerprint.totalBytes });
    await expect(stat(container)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
