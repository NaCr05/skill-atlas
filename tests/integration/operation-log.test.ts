import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { listOperations, runRecordedOperation } from "@/core/operations/operation-log";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("unified operation log", () => {
  it("records success and stable failure evidence without swallowing the original error", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-operations-"));
    temporaryDirectories.push(temporary);
    const options = { env: { CODEX_HOME: path.join(temporary, ".codex"), USERPROFILE: temporary }, homeDirectory: temporary };

    await runRecordedOperation({
      kind: "batch-update-check",
      target: "all",
      recoveryHref: "/operations",
      work: async () => ({ count: 2 }),
      describe: (result) => `${result.count} checked`,
    }, options);
    await expect(runRecordedOperation({
      kind: "duplicate-migration",
      target: "duplicate",
      recoveryHref: "/operations",
      work: async () => { throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED"); },
    }, options)).rejects.toMatchObject({ code: "DUPLICATE_MIGRATION_BLOCKED" });

    const records = await listOperations(options);
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.status)).toEqual(["failed", "succeeded"]);
    expect(records[0]).toMatchObject({ errorCode: "DUPLICATE_MIGRATION_BLOCKED", recoveryHref: "/operations" });
    expect(records[1].detail).toBe("2 checked");
  });

  it("persists auditable phase progress for the operation details drawer", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-operation-stages-"));
    temporaryDirectories.push(temporary);
    const options = { env: { CODEX_HOME: path.join(temporary, ".codex"), USERPROFILE: temporary }, homeDirectory: temporary };
    await runRecordedOperation({
      kind: "update", target: "sample", recoveryHref: "/trash",
      work: async (progress) => {
        await progress("preflight", "succeeded", "Checked");
        await progress("download", "running");
        await progress("download", "succeeded", "Verified staging");
        await progress("backup", "succeeded", "Backup ready");
        return "done";
      },
    }, options);
    const [record] = await listOperations(options);
    expect(record.stages?.map((stage) => [stage.code, stage.status])).toEqual([
      ["preflight", "succeeded"], ["download", "succeeded"], ["backup", "succeeded"], ["complete", "succeeded"],
    ]);
    expect(record.stages?.[1].startedAt).toBeTruthy();
    expect(record.stages?.[1].finishedAt).toBeTruthy();
  });

  it("filters unknown operation kinds from a tampered local log", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-operations-invalid-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const atlasRoot = path.join(codexHome, ".skill-atlas");
    await mkdir(atlasRoot, { recursive: true });
    await writeFile(path.join(atlasRoot, "operations.json"), JSON.stringify({ version: 1, records: [{
      id: "tampered", kind: "execute-anything", status: "succeeded", target: "x", startedAt: "2026-08-04T00:00:00.000Z",
    }] }));

    expect(await listOperations({ env: { CODEX_HOME: codexHome, USERPROFILE: temporary }, homeDirectory: temporary })).toEqual([]);
  });

  it("reports a corrupt operation document instead of presenting an empty history", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-operations-corrupt-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const atlasRoot = path.join(codexHome, ".skill-atlas");
    await mkdir(atlasRoot, { recursive: true });
    await writeFile(path.join(atlasRoot, "operations.json"), "{not-json");

    await expect(listOperations({ env: { CODEX_HOME: codexHome, USERPROFILE: temporary }, homeDirectory: temporary }))
      .rejects.toMatchObject({ code: "OPERATION_READ_FAILED" });
  });

  it("marks a running operation from a previous runtime as interrupted and persists recovery evidence", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-operations-interrupted-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const atlasRoot = path.join(codexHome, ".skill-atlas");
    const options = { env: { CODEX_HOME: codexHome, USERPROFILE: temporary }, homeDirectory: temporary };
    await mkdir(atlasRoot, { recursive: true });
    await writeFile(path.join(atlasRoot, "operations.json"), JSON.stringify({ version: 1, records: [{
      id: "orphaned", kind: "update", status: "running", target: "sample", runtimeId: "previous-process",
      startedAt: "2026-08-04T00:00:00.000Z", recoveryHref: "/trash",
    }] }));

    const records = await listOperations({ ...options, now: new Date("2026-08-04T00:00:01.000Z") });
    expect(records[0]).toMatchObject({ status: "interrupted", errorCode: "OPERATION_INTERRUPTED", recoveryHref: "/trash" });
    expect((await listOperations(options))[0].status).toBe("interrupted");
  });
});
