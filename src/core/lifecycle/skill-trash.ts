import { readdir } from "node:fs/promises";

import { inspectLifecycleRecovery } from "./reconcile";
import { listDisabledSkills } from "./skill-state";
import {
  assertTrashSkillDirectory,
  pathExists,
  readTrashManifest,
  resolveTrashRoot,
  type SkillTrashOptions,
} from "./skill-trash-store";
import { resolveLifecycleStorageRoots } from "./storage";
import type { SkillTrashOverview, TrashedSkillRecord } from "./types";

export {
  confirmSkillRemoval,
  inspectSkillRemoval,
  removalPlans,
} from "./skill-removal";
export {
  confirmPermanentDeletion,
  inspectPermanentDeletion,
  permanentDeletionPlans,
} from "./skill-purge";
export { restoreTrashedSkill } from "./skill-restore";
export type { SkillTrashOptions } from "./skill-trash-store";

/**
 * Public lifecycle seam for trash inventory. Mutation implementations stay
 * private to their operation modules while callers retain one stable entry.
 */
export async function listTrashedSkills(
  options: SkillTrashOptions = {},
): Promise<TrashedSkillRecord[]> {
  const root = resolveTrashRoot(options);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const record = await readTrashManifest(entry.name, options);
          if (
            !["committed", "failed"].includes(record.state) ||
            !(await pathExists(record.trashDirectory))
          ) {
            return undefined;
          }
          await assertTrashSkillDirectory(record, options);
          return record;
        } catch {
          return undefined;
        }
      }),
  );
  return records
    .filter((record): record is TrashedSkillRecord => Boolean(record))
    .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));
}

export async function getSkillTrashOverview(
  options: SkillTrashOptions = {},
): Promise<SkillTrashOverview> {
  const [records, disabledRecords, recovery] = await Promise.all([
    listTrashedSkills(options),
    listDisabledSkills(options),
    inspectLifecycleRecovery(options),
  ]);
  return {
    rootPath: resolveTrashRoot(options),
    count: records.length,
    totalBytes: records.reduce((total, record) => total + record.fingerprint.totalBytes, 0),
    records,
    disabledRoot: resolveLifecycleStorageRoots(options).disabledRoot,
    disabledCount: disabledRecords.length,
    disabledRecords,
    recovery,
  };
}
