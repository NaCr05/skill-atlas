"use client";

import {
  AlertTriangle,
  ArchiveRestore,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  GitCompareArrows,
  ListChecks,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { IssueOverview, InventoryIssue } from "@/core/issues/issue-planner";
import type { MigrationArchiveOverview, MigrationArchivePurgeResult } from "@/core/issues/migration-archive";
import type { BatchUpdateOverview, BatchUpdateRecord } from "@/core/lifecycle/update-batch";
import type { OperationRecord } from "@/core/operations/operation-log";
import { BatchUpdateReviewQueue } from "./batch-update-review-queue";
import { BreakablePath } from "./breakable-path";
import { DuplicateMigrationDialog } from "./duplicate-migration-dialog";
import { useLanguage } from "./language-provider";
import { MigrationArchivePurgeDialog } from "./migration-archive-purge-dialog";
import { OperationDetailDrawer } from "./operation-detail-drawer";

const emptyIssues: IssueOverview = { scannedAt: "", total: 0, duplicateCount: 0, missingDependencyCount: 0, issues: [] };
const emptyUpdates: BatchUpdateOverview = { trackedCount: 0, updateCount: 0, failedCount: 0, records: [] };
const emptyArchives: MigrationArchiveOverview = { rootPath: "", count: 0, totalBytes: 0, records: [] };

export function OperationsCenterClient() {
  const { language, t } = useLanguage();
  const [issues, setIssues] = useState(emptyIssues);
  const [updates, setUpdates] = useState(emptyUpdates);
  const [archives, setArchives] = useState(emptyArchives);
  const [operations, setOperations] = useState<OperationRecord[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [selectedUpdates, setSelectedUpdates] = useState<string[]>([]);
  const [issueQueueVisible, setIssueQueueVisible] = useState(false);
  const [updateQueueVisible, setUpdateQueueVisible] = useState(false);
  const [migrationSkillId, setMigrationSkillId] = useState("");
  const [purgeMigrationId, setPurgeMigrationId] = useState("");
  const [restoringMigrationId, setRestoringMigrationId] = useState("");
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<OperationRecord>();

  const headers = { "X-Skill-Atlas-Language": language };

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [issueResponse, updateResponse, archiveResponse, operationResponse] = await Promise.all([
        fetch("/api/issues", { cache: "no-store", headers }),
        fetch("/api/updates/batch", { cache: "no-store", headers }),
        fetch("/api/issues/migrations", { cache: "no-store", headers }),
        fetch("/api/operations", { cache: "no-store", headers }),
      ]);
      const [issuePayload, updatePayload, archivePayload, operationPayload] = await Promise.all([
        issueResponse.json(), updateResponse.json(), archiveResponse.json(), operationResponse.json(),
      ]);
      if (!issueResponse.ok || !updateResponse.ok || !archiveResponse.ok || !operationResponse.ok) {
        throw new Error(t("无法加载操作中心", "Unable to load the operations center"));
      }
      setIssues(issuePayload as IssueOverview);
      setUpdates(updatePayload as BatchUpdateOverview);
      setArchives(archivePayload as MigrationArchiveOverview);
      setOperations((operationPayload as { records: OperationRecord[] }).records || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const localHeaders = { "X-Skill-Atlas-Language": language };
        const [issueResponse, updateResponse, archiveResponse, operationResponse] = await Promise.all([
          fetch("/api/issues", { cache: "no-store", headers: localHeaders }),
          fetch("/api/updates/batch", { cache: "no-store", headers: localHeaders }),
          fetch("/api/issues/migrations", { cache: "no-store", headers: localHeaders }),
          fetch("/api/operations", { cache: "no-store", headers: localHeaders }),
        ]);
        const [issuePayload, updatePayload, archivePayload, operationPayload] = await Promise.all([
          issueResponse.json(), updateResponse.json(), archiveResponse.json(), operationResponse.json(),
        ]);
        if (!issueResponse.ok || !updateResponse.ok || !archiveResponse.ok || !operationResponse.ok) {
          throw new Error(language === "zh" ? "无法加载操作中心" : "Unable to load the operations center");
        }
        if (active) {
          setIssues(issuePayload as IssueOverview);
          setUpdates(updatePayload as BatchUpdateOverview);
          setArchives(archivePayload as MigrationArchiveOverview);
          setOperations((operationPayload as { records: OperationRecord[] }).records || []);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    const source = new EventSource("/api/operations/stream");
    const updateFromEvent = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { records?: OperationRecord[] };
        if (Array.isArray(payload.records)) setOperations(payload.records);
      } catch { /* Keep the last valid snapshot and let EventSource reconnect. */ }
    };
    source.addEventListener("operations", updateFromEvent);
    const fallback = window.setInterval(() => {
      if (source.readyState === EventSource.OPEN) return;
      void fetch("/api/operations", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } })
        .then(async (response) => response.ok ? response.json() as Promise<{ records: OperationRecord[] }> : undefined)
        .then((payload) => { if (payload?.records) setOperations(payload.records); })
        .catch(() => undefined);
    }, 5_000);
    return () => { window.clearInterval(fallback); source.close(); };
  }, [language]);

  async function checkUpdates() {
    setChecking(true);
    setError("");
    try {
      const response = await fetch("/api/updates/batch", { method: "POST", headers });
      const payload = await response.json() as BatchUpdateOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("批量检查失败", "Batch check failed"));
      setUpdates(payload);
      setSelectedUpdates([]);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }

  async function restoreMigration(migrationId: string) {
    setRestoringMigrationId(migrationId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/issues/migrations/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ migrationId }),
      });
      const payload = await response.json() as { skillName?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || t("恢复迁移归档失败", "Migration archive restore failed"));
      setNotice(t(`${payload.skillName || "Skill"} 已恢复到原位置。`, `${payload.skillName || "Skill"} was restored to its original location.`));
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRestoringMigrationId("");
    }
  }

  const issueQueue = useMemo(() => issues.issues.filter((issue) => selectedIssues.includes(issue.id)), [issues.issues, selectedIssues]);
  const updateQueue = useMemo(() => updates.records.filter((record) => selectedUpdates.includes(record.skillId)), [selectedUpdates, updates.records]);
  const interruptedCount = operations.filter((record) => record.status === "interrupted").length;

  function toggleIssue(issue: InventoryIssue) {
    setSelectedIssues((current) => current.includes(issue.id) ? current.filter((id) => id !== issue.id) : [...current, issue.id]);
    setIssueQueueVisible(false);
  }

  function toggleUpdate(record: BatchUpdateRecord) {
    setSelectedUpdates((current) => current.includes(record.skillId) ? current.filter((id) => id !== record.skillId) : [...current, record.skillId]);
  }

  async function migrated() {
    setMigrationSkillId("");
    setSelectedIssues([]);
    setIssueQueueVisible(false);
    await load(false);
  }

  async function purged(result: MigrationArchivePurgeResult) {
    setPurgeMigrationId("");
    if (result.auditStatus === "incomplete") setError(result.auditWarning || t("归档已删除，但最终审计记录不完整。", "The archive was removed, but its final audit record is incomplete."));
    else setNotice(t(`${result.skillName} 的迁移归档已永久清理。`, `The migration archive for ${result.skillName} was permanently removed.`));
    await load(false);
  }

  return <div className="operations-center">
    <section className="operations-summary">
      <article><span>{t("待处理问题", "Open issues")}</span><strong>{issues.total}</strong></article>
      <article><span>{t("发现更新", "Updates found")}</span><strong>{updates.updateCount}</strong></article>
      <article><span>{t("迁移归档", "Migration archives")}</span><strong>{archives.count}</strong></article>
      <article><span>{t("失败或中断", "Failed or interrupted")}</span><strong>{operations.filter((record) => record.status === "failed").length + interruptedCount}</strong></article>
      <button className="button button-quiet" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "is-spinning" : undefined} />{t("刷新", "Refresh")}</button>
    </section>
    {notice && <p className="inline-notice standalone"><CheckCircle2 size={15} />{notice}</p>}
    {error && <p className="inline-error standalone">{error}</p>}

    <section className="operations-panel">
      <header><div><span className="eyebrow">{t("批量问题处理", "BATCH ISSUE HANDLING")}</span><h2><ListChecks size={19} /> {t("选择问题，逐项审查", "Select issues, review one by one")}</h2><p>{t("批量选择只生成审查队列，不会自动修改文件。迁移和依赖安装仍需逐项确认。", "Batch selection creates a review queue only; migrations and dependency installations still require individual confirmation.")}</p></div><button className="button button-primary" type="button" disabled={!selectedIssues.length} onClick={() => setIssueQueueVisible(true)}>{t(`生成审查队列 (${selectedIssues.length})`, `Build review queue (${selectedIssues.length})`)}</button></header>
      <div className="issue-grid">{issues.issues.map((issue) => <article key={issue.id} data-kind={issue.kind}><label><input type="checkbox" checked={selectedIssues.includes(issue.id)} onChange={() => toggleIssue(issue)} /><span>{issue.kind === "duplicate-entry" ? t("重复入口", "Duplicate entry") : t("缺失依赖", "Missing dependency")}</span></label><h3>{issue.affectedSkills[0]?.displayName}</h3><p>{issue.kind === "duplicate-entry" ? t(`发现 ${issue.affectedSkills.length} 个同名入口。`, `${issue.affectedSkills.length} entries share the same name.`) : t(`缺少：${issue.missingDependencies?.join("、")}`, `Missing: ${issue.missingDependencies?.join(", ")}`)}</p></article>)}</div>
      {issueQueueVisible && <div className="review-queue">{issueQueue.map((issue, index) => <article key={issue.id}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{issue.affectedSkills[0]?.displayName}</h3><ul>{localizedSuggestions(issue, language).map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul><div className="queue-actions">{issue.migrationCandidateIds.map((skillId) => <button key={skillId} className="button button-primary" type="button" onClick={() => setMigrationSkillId(skillId)}><Wrench size={14} />{t("审查重复入口迁移", "Review duplicate migration")}</button>)}{issue.missingDependencies?.map((dependency) => <Link key={dependency} className="button button-quiet" href={dependencyRepairHref(issue, dependency)}>{t(`搜索并修复 ${dependency}`, `Search and repair ${dependency}`)} <ArrowUpRight size={14} /></Link>)}</div></div></article>)}</div>}
    </section>

    <section className="operations-panel">
      <header><div><span className="eyebrow">{t("重复入口归档", "DUPLICATE-ENTRY ARCHIVES")}</span><h2><DatabaseBackup size={19} /> {t("恢复原位置或彻底清理", "Restore in place or permanently clean up")}</h2><p>{t("归档保留了完整目录和指纹。恢复会检查原位置是否为空；永久清理必须再次审查并输入完整 Skill 名称。", "Archives retain the complete directory and fingerprint. Restore requires an empty original location; permanent cleanup requires a fresh review and exact Skill name.")}</p><BreakablePath className="operations-root-path" value={archives.rootPath || "—"} /></div></header>
      <div className="migration-archive-list">{archives.records.length ? archives.records.map((record) => <article key={record.migrationId} data-health={record.health}><div><strong>{record.skillName}</strong><small>{record.health === "ready" ? t("指纹验证通过", "Fingerprint verified") : t("归档记录损坏", "Archive record is damaged")}</small></div><div><span>{t("当前归档", "Current archive")}</span><BreakablePath value={record.archivedDirectory} />{record.originalDirectory && <><span>{t("原位置", "Original location")}</span><BreakablePath value={record.originalDirectory} /></>}</div>{record.diagnostic && <p>{record.diagnostic}</p>}<div className="archive-actions"><button className="button button-quiet" type="button" disabled={!record.restorable || Boolean(restoringMigrationId)} onClick={() => void restoreMigration(record.migrationId)}><ArchiveRestore size={14} />{restoringMigrationId === record.migrationId ? t("正在恢复…", "Restoring…") : t("恢复原位置", "Restore original location")}</button><button className="button button-danger" type="button" disabled={!record.purgeAllowed || Boolean(restoringMigrationId)} onClick={() => setPurgeMigrationId(record.migrationId)}><Trash2 size={14} />{t("彻底清理", "Permanently clean up")}</button></div></article>) : <p className="operations-empty">{t("暂无重复入口迁移归档。", "No duplicate-entry migration archives.")}</p>}</div>
    </section>

    <section className="operations-panel">
      <header><div><span className="eyebrow">{t("上游版本与批量更新", "UPSTREAM CHECK & BATCH UPDATE")}</span><h2><GitCompareArrows size={19} /> {t("逐项查看差异，按顺序安全更新", "Review each diff and update sequentially")}</h2><p>{t("先批量检查，再勾选有更新的 Skill。队列会为每一项重新生成最新审查，不会自动跳过人工确认。", "Run a batch check, then select Skills with updates. The queue refreshes every review and never bypasses human confirmation.")}</p></div><div className="panel-header-actions"><button className="button button-quiet" type="button" onClick={() => void checkUpdates()} disabled={checking}><GitCompareArrows size={15} />{checking ? t("正在检查…", "Checking…") : t("检查全部上游", "Check all upstreams")}</button><button className="button button-primary" type="button" disabled={!selectedUpdates.length} onClick={() => setUpdateQueueVisible(true)}><PackageCheck size={15} />{t(`审查并更新 (${selectedUpdates.length})`, `Review and update (${selectedUpdates.length})`)}</button></div></header>
      <div className="update-check-list">{updates.records.length ? updates.records.map((record) => {
        const actionable = record.status === "update-available" || record.status === "local-changes" || record.status === "differences-found";
        return <article key={record.skillId} data-status={record.status}><label><input type="checkbox" disabled={!actionable} checked={selectedUpdates.includes(record.skillId)} onChange={() => toggleUpdate(record)} /><span><strong>{record.skillName}</strong><code>{record.revision?.slice(0, 12) || "—"}</code></span></label><span>{updateStatusLabel(record, language)}</span><Link href={`/skills/${record.skillId}`}>{t("打开详情", "Open details")} <ArrowUpRight size={13} /></Link></article>;
      }) : <p className="operations-empty">{t("尚未执行批量检查。", "No batch check has run yet.")}</p>}</div>
    </section>

    <section className="operations-panel">
      <header><div><span className="eyebrow">{t("实时操作记录", "LIVE OPERATION LOG")}</span><h2><Clock3 size={19} /> {t("无需刷新即可查看进度、中断和恢复入口", "Live progress, interruption, and recovery without refreshing")}</h2></div><span className="live-indicator"><i /> SSE</span></header>
      <div className="operation-log">{operations.length ? operations.map((record) => <article key={record.id} data-status={record.status}><span>{record.status === "succeeded" ? <CheckCircle2 size={16} /> : record.status === "failed" || record.status === "interrupted" ? <AlertTriangle size={16} /> : <RotateCcw size={16} className="is-spinning" />}</span><div><strong>{operationLabel(record.kind, language)}</strong><small>{operationDetail(record, language)}</small><time>{new Date(record.startedAt).toLocaleString()}</time></div><b>{operationStatusLabel(record.status, language)}</b><button className="operation-detail-button" type="button" onClick={() => setSelectedOperation(record)}>{t("查看阶段", "View phases")}</button>{record.recoveryHref && <Link href={record.recoveryHref}>{record.status === "failed" || record.status === "interrupted" ? t("打开恢复入口", "Open recovery") : t("查看相关页面", "Open related page")}</Link>}</article>) : <p className="operations-empty">{t("还没有操作记录。", "No operation records yet.")}</p>}</div>
    </section>

    {migrationSkillId && <DuplicateMigrationDialog skillId={migrationSkillId} onClose={() => setMigrationSkillId("")} onMigrated={migrated} />}
    {purgeMigrationId && <MigrationArchivePurgeDialog migrationId={purgeMigrationId} onClose={() => setPurgeMigrationId("")} onPurged={purged} />}
    {updateQueueVisible && <BatchUpdateReviewQueue records={updateQueue} onClose={() => setUpdateQueueVisible(false)} onComplete={async () => { setSelectedUpdates([]); await load(false); }} />}
    {selectedOperation && <OperationDetailDrawer record={selectedOperation} onClose={() => setSelectedOperation(undefined)} />}
  </div>;
}

function operationLabel(kind: OperationRecord["kind"], language: "zh" | "en") {
  const labels: Record<OperationRecord["kind"], [string, string]> = {
    install: ["安装 Skill", "Install Skill"], update: ["更新 Skill", "Update Skill"], disable: ["停用 Skill", "Disable Skill"], enable: ["重新启用", "Re-enable Skill"], remove: ["移入回收站", "Move to trash"], restore: ["恢复 Skill", "Restore Skill"], purge: ["永久删除", "Permanent deletion"], recovery: ["恢复中心动作", "Recovery action"], "batch-update-check": ["批量上游检查", "Batch upstream check"], "duplicate-migration": ["重复入口迁移", "Duplicate migration"], "migration-restore": ["恢复重复入口", "Restore duplicate entry"], "migration-purge": ["清理迁移归档", "Purge migration archive"], "storage-cleanup": ["清理私有存储", "Clean private storage"], "data-import": ["导入本地数据", "Import local data"],
  };
  return labels[kind][language === "zh" ? 0 : 1];
}

function operationStatusLabel(status: OperationRecord["status"], language: "zh" | "en") {
  const labels: Record<OperationRecord["status"], [string, string]> = { running: ["进行中", "Running"], succeeded: ["成功", "Succeeded"], failed: ["失败", "Failed"], interrupted: ["已中断", "Interrupted"] };
  return labels[status][language === "zh" ? 0 : 1];
}

function operationDetail(record: OperationRecord, language: "zh" | "en") {
  if (record.status === "interrupted") return language === "zh" ? "上一次 Skill Atlas 进程在记录最终结果前停止；请打开恢复入口检查实际状态。" : "The previous Skill Atlas process stopped before recording a final result. Open recovery to inspect the actual state.";
  return record.detail || record.target;
}

function updateStatusLabel(record: BatchUpdateRecord, language: "zh" | "en") {
  const labels: Record<BatchUpdateRecord["status"], [string, string]> = {
    "up-to-date": ["已是最新", "Up to date"], "update-available": ["有上游更新", "Update available"], "differences-found": ["发现差异", "Differences found"], "local-changes": ["有更新且本地已修改", "Update with local changes"], failed: ["检查失败", "Check failed"],
  };
  return labels[record.status][language === "zh" ? 0 : 1];
}

function dependencyRepairHref(issue: InventoryIssue, dependency: string) {
  const parameters = new URLSearchParams({ q: dependency, repairIssue: issue.id, consumer: issue.affectedSkills[0]?.name || "", dependency });
  return `/marketplace?${parameters.toString()}`;
}

function localizedSuggestions(issue: InventoryIssue, language: "zh" | "en"): string[] {
  if (language === "en") return issue.suggestions;
  const skill = issue.affectedSkills[0];
  if (issue.kind === "missing-dependency") {
    return (issue.missingDependencies || []).map((dependency) => `在技能市场中精确搜索 ${dependency}，审查来源并安装后自动重新扫描，再确认 ${skill?.displayName || "该 Skill"} 的依赖状态。`);
  }
  const canonical = issue.affectedSkills.find((entry) => entry.id === issue.canonicalSkillId);
  return [
    `保留 ${canonical?.source || canonical?.displayName || "首选来源"} 作为生效入口。`,
    issue.migrationCandidateIds.length ? "逐项审查兼容目录中的重复入口，将确认冗余的完整目录迁入私有归档。" : "该重复组没有 Skill Atlas 可以安全迁移的兼容目录入口。",
  ];
}
