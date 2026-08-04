import { readFile } from "node:fs/promises";
import path from "node:path";

import { discoverSkills } from "@/core/skills/discover";
import type { SkillRecord } from "@/core/skills/types";
import { inspectSkillUpdate } from "./inspect-update";
import { resolveLifecycleStorageRoots, type LifecycleStorageOptions } from "./storage";
import { writeJsonAtomically } from "./transaction-store";
import type { UpdatePreviewStatus } from "./types";

export interface BatchUpdateRecord {
  skillId: string;
  skillName: string;
  status: UpdatePreviewStatus | "failed";
  checkedAt: string;
  sourceUrl: string;
  revision?: string;
  previewId?: string;
  summary?: { added: number; modified: number; removed: number; unchanged: number };
  errorCode?: "UPSTREAM_CHECK_FAILED";
}

export interface BatchUpdateOverview {
  checkedAt?: string;
  trackedCount: number;
  updateCount: number;
  failedCount: number;
  records: BatchUpdateRecord[];
}

interface BatchDocument { version: 1; checkedAt: string; records: BatchUpdateRecord[] }
export interface BatchUpdateOptions extends LifecycleStorageOptions { fetcher?: typeof fetch; now?: Date; skills?: SkillRecord[] }

function cacheLocation(options: LifecycleStorageOptions): string {
  return path.join(resolveLifecycleStorageRoots(options).atlasRoot, "update-status.json");
}

function overview(records: BatchUpdateRecord[], checkedAt?: string): BatchUpdateOverview {
  return {
    checkedAt,
    trackedCount: records.length,
    updateCount: records.filter((record) => ["update-available", "local-changes"].includes(record.status)).length,
    failedCount: records.filter((record) => record.status === "failed").length,
    records,
  };
}

export async function readBatchUpdateOverview(options: LifecycleStorageOptions = {}): Promise<BatchUpdateOverview> {
  try {
    const value = JSON.parse(await readFile(cacheLocation(options), "utf8")) as Partial<BatchDocument>;
    return overview(Array.isArray(value.records) ? value.records : [], value.checkedAt);
  } catch { return overview([]); }
}

export async function inspectAllTrackedUpdates(options: BatchUpdateOptions = {}): Promise<BatchUpdateOverview> {
  const skills = options.skills || (await discoverSkills({ env: options.env, homeDirectory: options.homeDirectory, forceRefresh: true })).skills;
  const tracked = skills.filter((skill) => skill.source.kind === "personal" && skill.source.permission === "manage" && skill.sourceTracking.status === "tracked");
  const checkedAt = (options.now || new Date()).toISOString();
  const records: BatchUpdateRecord[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tracked.length) {
      const skill = tracked[cursor++];
      const sourceUrl = skill.sourceTracking.status === "tracked" ? skill.sourceTracking.sourceUrl : "";
      try {
        const preview = await inspectSkillUpdate({ skillId: skill.id }, { env: options.env, homeDirectory: options.homeDirectory, fetcher: options.fetcher, skill, now: options.now });
        records.push({ skillId: skill.id, skillName: skill.name, status: preview.status, checkedAt, sourceUrl, revision: preview.source.revision, previewId: preview.previewId, summary: preview.summary });
      } catch {
        records.push({ skillId: skill.id, skillName: skill.name, status: "failed", checkedAt, sourceUrl, errorCode: "UPSTREAM_CHECK_FAILED" });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, tracked.length) }, () => worker()));
  records.sort((a, b) => a.skillName.localeCompare(b.skillName));
  await writeJsonAtomically(cacheLocation(options), { version: 1, checkedAt, records } satisfies BatchDocument);
  return overview(records, checkedAt);
}

export async function markBatchUpdateApplied(
  skillId: string,
  revision: string,
  options: LifecycleStorageOptions & { now?: Date } = {},
): Promise<BatchUpdateOverview> {
  const current = await readBatchUpdateOverview(options);
  const checkedAt = (options.now || new Date()).toISOString();
  const records = current.records.map((record) => record.skillId === skillId ? {
    ...record,
    status: "up-to-date" as const,
    checkedAt,
    revision,
    previewId: undefined,
    summary: { added: 0, modified: 0, removed: 0, unchanged: record.summary?.unchanged || 0 },
    errorCode: undefined,
  } : record);
  await writeJsonAtomically(cacheLocation(options), { version: 1, checkedAt, records } satisfies BatchDocument);
  return overview(records, checkedAt);
}
