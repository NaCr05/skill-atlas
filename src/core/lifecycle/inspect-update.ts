import { randomUUID } from "node:crypto";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { inspectGithubSkillSource } from "@/core/github/skill-source";
import { findSkillById, invalidateSkillInventoryCache } from "@/core/skills/discover";
import type { SkillRecord } from "@/core/skills/types";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { snapshotLocalSkill } from "./fingerprint";
import { recordTrackedSource, skillDirectoryKey } from "./source-registry";
import type {
  FileChangeKind,
  FingerprintedFile,
  InternalUpdatePreviewPlan,
  SkillFileChange,
  SkillUpdatePreview,
  TrackedSkillSource,
  UpdateRisk,
} from "./types";
import { evaluateSourcePolicy, loadSourcePolicy } from "@/core/source-policy/source-policy";

const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;
const EXECUTABLE_EXTENSIONS = new Set([
  ".bat", ".cmd", ".com", ".exe", ".js", ".mjs", ".msi", ".ps1", ".py", ".sh",
]);

export const updatePreviewPlans = getReviewPlanStore<InternalUpdatePreviewPlan>("source-update");

interface UpdateInspectionOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  fetcher?: typeof fetch;
  now?: Date;
  skill?: SkillRecord;
}

function compareFiles(localFiles: FingerprintedFile[], upstreamFiles: FingerprintedFile[]): SkillFileChange[] {
  const local = new Map(localFiles.map((file) => [file.path.toLocaleLowerCase(), file]));
  const upstream = new Map(upstreamFiles.map((file) => [file.path.toLocaleLowerCase(), file]));
  const keys = new Set([...local.keys(), ...upstream.keys()]);
  return [...keys].map((key) => {
    const localFile = local.get(key);
    const upstreamFile = upstream.get(key);
    let kind: FileChangeKind;
    if (!localFile) kind = "added";
    else if (!upstreamFile) kind = "removed";
    else if (localFile.gitBlobSha !== upstreamFile.gitBlobSha) kind = "modified";
    else kind = "unchanged";
    return {
      path: upstreamFile?.path || localFile?.path || key,
      kind,
      localSize: localFile?.size,
      upstreamSize: upstreamFile?.size,
      localBlobSha: localFile?.gitBlobSha,
      upstreamBlobSha: upstreamFile?.gitBlobSha,
    };
  }).sort((left, right) => {
    const rank: Record<FileChangeKind, number> = { modified: 0, added: 1, removed: 2, unchanged: 3 };
    return rank[left.kind] - rank[right.kind] || left.path.localeCompare(right.path);
  });
}

async function resolveSkill(skillId: string, supplied?: SkillRecord): Promise<SkillRecord> {
  const skill = supplied?.id === skillId ? supplied : await findSkillById(skillId);
  if (!skill) throw new SkillAtlasError("UPDATE_SKILL_NOT_FOUND");
  if (skill.source.kind !== "personal" || skill.source.permission !== "manage") {
    throw new SkillAtlasError("UPDATE_READ_ONLY");
  }
  return skill;
}

export async function inspectSkillUpdate(
  input: { skillId: string; sourceUrl?: string },
  options: UpdateInspectionOptions = {},
): Promise<SkillUpdatePreview> {
  const skill = await resolveSkill(input.skillId, options.skill);
  const tracked = skill.sourceTracking.status === "tracked" ? skill.sourceTracking : undefined;
  const sourceUrl = input.sourceUrl?.trim() || tracked?.sourceUrl;
  if (!sourceUrl) throw new SkillAtlasError("UPDATE_SOURCE_REQUIRED");

  const [localSnapshot, upstream] = await Promise.all([
    snapshotLocalSkill(skill.directoryPath, { maxFiles: MAX_FILES }),
    inspectGithubSkillSource({ sourceUrl, skillName: skill.name }, {
      env: options.env,
      fetcher: options.fetcher,
    }),
  ]);
  const upstreamFiles: FingerprintedFile[] = upstream.entries
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: entry.path, size: entry.size || 0, gitBlobSha: entry.sha }));
  const changes = compareFiles(localSnapshot.files, upstreamFiles);
  const summary = changes.reduce<Record<FileChangeKind, number>>(
    (totals, change) => ({ ...totals, [change.kind]: totals[change.kind] + 1 }),
    { added: 0, modified: 0, removed: 0, unchanged: 0 },
  );
  const localDiverged = Boolean(
    tracked && tracked.localFingerprint !== localSnapshot.fingerprint.value,
  );
  const sameFingerprint = localSnapshot.fingerprint.complete
    && localSnapshot.fingerprint.value === upstream.fingerprint.value;
  const status = sameFingerprint
    ? "up-to-date"
    : localDiverged
      ? "local-changes"
      : tracked
        ? "update-available"
        : "differences-found";

  const risks: UpdateRisk[] = [{
    level: "info",
    code: "transactional-update",
    title: "更新采用完整备份与原子替换",
    detail: "确认后先下载到私有暂存目录并验证指纹，再备份当前版本；失败时自动回滚。任何脚本都不会被执行。",
  }];
  const changedScripts = changes.filter(
    (change) => change.kind !== "unchanged"
      && change.kind !== "removed"
      && EXECUTABLE_EXTENSIONS.has(path.extname(change.path).toLocaleLowerCase()),
  );
  if (changedScripts.length) {
    risks.push({
      level: "review",
      code: "new-or-modified-scripts",
      title: `${changedScripts.length} 个脚本将新增或改变`,
      detail: changedScripts.slice(0, 10).map((change) => change.path).join("、"),
    });
  }
  const skillDocumentChanged = changes.some(
    (change) => change.path.toLocaleLowerCase() === "skill.md" && change.kind !== "unchanged",
  );
  if (skillDocumentChanged) {
    risks.push({
      level: "review",
      code: "metadata-changed",
      title: "SKILL.md 已发生变化",
      detail: "调用说明或元数据可能改变，后续更新前必须重新审查。",
    });
  }
  if (!upstream.parsedSkill.metadataValid) {
    risks.push({
      level: "blocked",
      code: "metadata-invalid",
      title: "上游 Skill 元数据无效",
      detail: upstream.parsedSkill.issues.join("；"),
    });
  }
  if (upstream.parsedSkill.name.toLocaleLowerCase() !== skill.name.toLocaleLowerCase()) {
    risks.push({
      level: "blocked",
      code: "source-name-mismatch",
      title: "上游 Skill 名称不匹配",
      detail: `本地为 ${skill.name}，上游声明为 ${upstream.parsedSkill.name}。`,
    });
  }
  const unsupported = upstream.entries.filter(
    (entry) => entry.type !== "blob" || entry.mode === "120000" || entry.mode === "160000",
  );
  if (unsupported.length || localSnapshot.unsupportedPaths.length) {
    risks.push({
      level: "blocked",
      code: "unsupported-entry",
      title: "包含链接、子模块或不支持的本地条目",
      detail: [
        ...unsupported.map((entry) => entry.path),
        ...localSnapshot.unsupportedPaths,
      ].slice(0, 10).join("、"),
    });
  }
  if (
    !localSnapshot.fingerprint.complete
    || upstream.fingerprint.fileCount > MAX_FILES
    || upstream.fingerprint.totalBytes > MAX_BYTES
  ) {
    risks.push({
      level: "blocked",
      code: "source-limit",
      title: "文件数量或体积超过安全预览上限",
      detail: `当前上限为 ${MAX_FILES} 个文件和 20 MB。`,
    });
  }
  if (localDiverged) {
    risks.push({
      level: "review",
      code: "local-divergence",
      title: "检测到追踪后的本地改动",
      detail: "未来执行更新前需要先备份，并明确处理本地改动。",
    });
  }

  const now = options.now || new Date();
  const previewId = randomUUID();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const trackingAvailable = !tracked && !risks.some((risk) => risk.level === "blocked");
  const policyEvaluation = evaluateSourcePolicy(upstream.trust, await loadSourcePolicy(options));
  const trackingRecord: TrackedSkillSource = {
    skillDirectory: skillDirectoryKey(skill.directoryPath, {
      env: options.env,
      homeDirectory: options.homeDirectory,
    }),
    sourceUrl: upstream.sourceUrl,
    repository: upstream.repository,
    ref: upstream.ref,
    sourceDirectory: upstream.sourceDirectory,
    revision: upstream.revision,
    upstreamFingerprint: upstream.fingerprint.value,
    localFingerprint: localSnapshot.fingerprint.value,
    trackedAt: now.toISOString(),
    sourceTrust: upstream.trust,
    policyStatus: policyEvaluation.blocked ? "blocked" : policyEvaluation.trusted ? "trusted" : "unlisted",
  };
  const preview: InternalUpdatePreviewPlan = {
    previewId,
    expiresAt,
    skillId: skill.id,
    skillName: skill.name,
    status,
    previewOnly: false,
    updateAllowed: status !== "up-to-date" && !risks.some((risk) => risk.level === "blocked"),
    trackingAvailable,
    source: {
      sourceUrl: upstream.sourceUrl,
      repository: upstream.repository,
      ref: upstream.ref,
      sourceDirectory: upstream.sourceDirectory,
      revision: upstream.revision,
    },
    local: localSnapshot.fingerprint,
    upstream: upstream.fingerprint,
    baseline: tracked ? {
      localFingerprint: tracked.localFingerprint,
      upstreamFingerprint: tracked.upstreamFingerprint,
      revision: tracked.revision,
      trackedAt: tracked.trackedAt,
    } : undefined,
    localDiverged,
    summary,
    changes,
    risks,
    localDirectory: skill.directoryPath,
    trackingRecord,
    entries: upstream.entries,
  };
  updatePreviewPlans.put(previewId, preview, now);
  const { localDirectory: _localDirectory, trackingRecord: _trackingRecord, entries: _entries, ...publicPreview } = preview;
  void _localDirectory;
  void _trackingRecord;
  void _entries;
  return publicPreview;
}

export async function confirmSourceTracking(
  previewId: string,
  options: UpdateInspectionOptions = {},
): Promise<TrackedSkillSource> {
  const now = options.now || new Date();
  const consumed = updatePreviewPlans.consume(previewId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("UPDATE_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("UPDATE_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.trackingAvailable) throw new SkillAtlasError("UPDATE_BLOCKED");
  const skill = await resolveSkill(plan.skillId, options.skill);
  const current = await snapshotLocalSkill(skill.directoryPath, { maxFiles: MAX_FILES });
  if (!current.fingerprint.complete || current.fingerprint.value !== plan.local.value) {
    throw new SkillAtlasError("UPDATE_STATE_CHANGED");
  }
  await recordTrackedSource(plan.trackingRecord, {
    env: options.env,
    homeDirectory: options.homeDirectory,
  });
  invalidateSkillInventoryCache();
  return plan.trackingRecord;
}
