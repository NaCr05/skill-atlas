"use client";

import {
  AlertTriangle,
  ArchiveRestore,
  Check,
  CircleCheckBig,
  Copy,
  FileArchive,
  FolderArchive,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { localeFor } from "@/core/i18n";
import type {
  PermanentDeletionResult,
  DisabledSkillRecord,
  LifecycleRecoveryIssue,
  LifecycleRecoveryAction,
  LifecycleRecoveryOverview,
  SkillRestoreResult,
  SkillEnableResult,
  SkillTrashOverview,
  TrashedSkillRecord,
} from "@/core/lifecycle/types";
import { useLanguage } from "./language-provider";
import { BreakablePath } from "./breakable-path";
import { PermanentDeleteDialog } from "./permanent-delete-dialog";
import styles from "./lifecycle-recovery.module.css";

function bytesLabel(bytes: number, language: "zh" | "en"): string {
  if (bytes < 1024) return `${bytes.toLocaleString(localeFor(language))} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString(localeFor(language), { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString(localeFor(language), { maximumFractionDigits: 1 })} MB`;
}

function withoutRecord(
  overview: SkillTrashOverview,
  trashId: string,
): SkillTrashOverview {
  const records = overview.records.filter((record) => record.trashId !== trashId);
  return {
    ...overview,
    records,
    count: records.length,
    totalBytes: records.reduce((total, record) => total + record.fingerprint.totalBytes, 0),
  };
}

function emptyRecovery(rootPath: string): LifecycleRecoveryOverview {
  const atlasRoot = rootPath.replace(/[\\/]trash$/i, "");
  return {
    inspectedAt: new Date().toISOString(),
    healthy: true,
    counts: { total: 0, trash: 0, quarantine: 0, transactions: 0, staging: 0 },
    roots: {
      atlasRoot,
      trashRoot: rootPath,
      purgeRoot: `${atlasRoot}\\purge`,
      transactionRoot: `${atlasRoot}\\transactions`,
      backupRoot: `${atlasRoot}\\backups`,
      stagingRoot: `${atlasRoot}\\staging`,
      disabledRoot: `${atlasRoot}\\disabled`,
    },
    issues: [],
  };
}

function withRecoveryFallback(overview: SkillTrashOverview): SkillTrashOverview {
  const atlasRoot = overview.rootPath.replace(/[\\/]trash$/i, "");
  return {
    ...overview,
    disabledRoot: overview.disabledRoot || `${atlasRoot}\\disabled`,
    disabledCount: overview.disabledCount || 0,
    disabledRecords: overview.disabledRecords || [],
    recovery: overview.recovery || emptyRecovery(overview.rootPath),
  };
}

function recoveryCopy(
  issue: LifecycleRecoveryIssue,
  language: "zh" | "en",
): { title: string; detail: string } {
  const zh = language === "zh";
  const copy: Record<LifecycleRecoveryIssue["code"], [string, string]> = {
    "trash-root-unreadable": ["无法读取回收站根目录", "请检查目录权限；普通回收站列表可能不完整。"],
    "trash-entry-unsafe": ["发现不受支持的回收站条目", "该条目不是安全的直接普通目录，需要人工检查。"],
    "trash-manifest-invalid": ["回收站记录损坏", "manifest.json 缺失、无法解析或格式不受支持。"],
    "trash-operation-incomplete": ["移入回收站的事务未完成", "记录仍停在 planned 状态，需要核对原目录与回收站内容。"],
    "trash-path-mismatch": ["回收站路径与记录不一致", "为避免移动错误目录，自动恢复已被阻止。"],
    "trash-fingerprint-mismatch": ["回收站内容已发生变化", "当前文件与删除时记录的完整指纹不一致。"],
    "trash-record-failed": ["回收站事务记录为失败", "文件仍然完整，可以优先尝试正常恢复。"],
    "trash-skill-missing": ["回收站中的 Skill 目录缺失", "记录存在，但对应的完整 Skill 目录不可读取。"],
    "purge-root-unreadable": ["无法读取永久删除隔离区", "请检查目录权限；可能存在未完成的永久删除事务。"],
    "purge-entry-unsafe": ["隔离区包含不安全条目", "该条目不是可验证的直接普通目录。"],
    "purge-manifest-invalid": ["隔离区记录损坏", "无法确定这条遗留目录对应哪个 Skill。"],
    "purge-quarantine-intact": ["发现完整的遗留隔离目录", "文件指纹完整，具备安全恢复到回收站的条件；当前不会自动移动。"],
    "purge-quarantine-partial": ["发现不完整的遗留隔离目录", "永久删除可能只完成了一部分，必须人工检查剩余文件。"],
    "staging-root-unreadable": ["无法读取更新暂存区", "请检查目录权限；未完成的安全更新可能留有诊断文件。"],
    "staging-entry-unsafe": ["暂存区包含不安全条目", "该条目不是受支持的直接普通目录，需要人工检查。"],
    "staging-entry-orphaned": ["发现遗留更新暂存目录", "目录已超过活动事务保护时间，可由恢复中心安全清理。"],
    "transaction-root-unreadable": ["无法读取事务日志目录", "生命周期操作的审计状态可能不完整。"],
    "transaction-record-invalid": ["事务日志损坏", "日志不是受支持的 JSON 事务记录。"],
    "transaction-failed": ["生命周期事务失败", "请结合操作类型、失败信息和相关目录进行处理。"],
    "transaction-incomplete": ["生命周期事务长时间未完成", "事务仍停在中间状态，可能来自进程退出或最终审计写入失败。"],
  };
  const english: Record<LifecycleRecoveryIssue["code"], [string, string]> = {
    "trash-root-unreadable": ["Trash root cannot be read", "Check directory permissions; the normal trash list may be incomplete."],
    "trash-entry-unsafe": ["Unsupported trash entry found", "The entry is not a safe direct ordinary directory and needs manual review."],
    "trash-manifest-invalid": ["Corrupted trash record", "manifest.json is missing, unreadable, or uses an unsupported format."],
    "trash-operation-incomplete": ["Move-to-trash transaction is incomplete", "The record remains planned; compare the original and trash locations."],
    "trash-path-mismatch": ["Trash path does not match its record", "Automatic restore is blocked to avoid moving the wrong directory."],
    "trash-fingerprint-mismatch": ["Trash contents have changed", "Current files no longer match the complete fingerprint recorded at removal."],
    "trash-record-failed": ["Trash transaction is marked failed", "The files remain complete and normal restore is the safest next step."],
    "trash-skill-missing": ["Skill directory is missing from trash", "The record exists, but the complete Skill directory cannot be read."],
    "purge-root-unreadable": ["Purge quarantine cannot be read", "Check directory permissions; an unfinished permanent deletion may remain."],
    "purge-entry-unsafe": ["Unsafe quarantine entry found", "The entry is not a verifiable direct ordinary directory."],
    "purge-manifest-invalid": ["Corrupted quarantine record", "Skill Atlas cannot determine which Skill owns this leftover directory."],
    "purge-quarantine-intact": ["Complete quarantine directory remains", "Its fingerprint is intact and it can be safely returned to trash; no move is automatic yet."],
    "purge-quarantine-partial": ["Partial quarantine directory remains", "Permanent deletion may have removed only part of the files; manual review is required."],
    "staging-root-unreadable": ["Update staging cannot be read", "Check directory permissions; an unfinished safe update may retain diagnostic files."],
    "staging-entry-unsafe": ["Unsafe staging entry found", "The entry is not a supported direct ordinary directory and needs manual review."],
    "staging-entry-orphaned": ["Orphaned update staging directory found", "It is older than the active transaction grace period and can be cleaned safely."],
    "transaction-root-unreadable": ["Transaction journal cannot be read", "Lifecycle audit state may be incomplete."],
    "transaction-record-invalid": ["Corrupted transaction journal", "The journal is not a supported JSON transaction record."],
    "transaction-failed": ["Lifecycle transaction failed", "Review the operation, failure detail, and related locations."],
    "transaction-incomplete": ["Lifecycle transaction did not finish", "It remains in an intermediate state after a process exit or final audit-write failure."],
  };
  const [title, detail] = (zh ? copy : english)[issue.code];
  return { title, detail };
}

function recoveryLabel(
  recoverability: LifecycleRecoveryIssue["recoverability"],
  language: "zh" | "en",
): string {
  if (recoverability === "safe-restore") return language === "zh" ? "具备安全恢复条件" : "Safe recovery possible";
  if (recoverability === "safe-cleanup") return language === "zh" ? "可安全清理" : "Safe cleanup";
  if (recoverability === "safe-retry") return language === "zh" ? "可安全重试" : "Safe retry";
  if (recoverability === "audit-only") return language === "zh" ? "审计记录" : "Audit record";
  return language === "zh" ? "需要人工检查" : "Manual review required";
}

export function TrashPageClient({
  initialOverview,
}: {
  initialOverview: SkillTrashOverview;
}) {
  const { language, t } = useLanguage();
  const [overview, setOverview] = useState(() => withRecoveryFallback(initialOverview));
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState("");
  const [enablingId, setEnablingId] = useState("");
  const [recoveryWorkingId, setRecoveryWorkingId] = useState("");
  const [purgeRecord, setPurgeRecord] = useState<TrashedSkillRecord | null>(null);
  const [copiedPath, setCopiedPath] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/lifecycle/trash", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } });
      const payload = (await response.json()) as SkillTrashOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法读取回收站", "Unable to read the trash"));
      setOverview(withRecoveryFallback(payload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("无法读取回收站", "Unable to read the trash"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function refreshFromDisk() {
      try {
        const response = await fetch("/api/lifecycle/trash", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } });
        const payload = (await response.json()) as SkillTrashOverview & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || (language === "zh" ? "无法读取回收站" : "Unable to read the trash"));
        }
        if (active) setOverview(withRecoveryFallback(payload));
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error
            ? loadError.message
            : (language === "zh" ? "无法读取回收站" : "Unable to read the trash"));
        }
      }
    }
    void refreshFromDisk();
    return () => {
      active = false;
    };
  }, [language]);

  async function restore(record: TrashedSkillRecord) {
    setRestoringId(record.trashId);
    setError("");
    setNotice("");
    setWarning("");
    try {
      const response = await fetch("/api/lifecycle/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ trashId: record.trashId }),
      });
      const payload = (await response.json()) as SkillRestoreResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("恢复失败", "Restore failed"));
      setOverview((current) => withoutRecord(current, record.trashId));
      setNotice(t(`${record.skillName} 已恢复到原目录。`, `${record.skillName} was restored to its original directory.`));
      await load();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : t("恢复失败", "Restore failed"));
    } finally {
      setRestoringId("");
    }
  }

  async function enable(record: DisabledSkillRecord) {
    setEnablingId(record.disabledId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/lifecycle/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ disabledId: record.disabledId }),
      });
      const payload = await response.json() as SkillEnableResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("重新启用失败", "Re-enable failed"));
      setNotice(t(`${record.skillName} 已恢复到原目录并重新启用。`, `${record.skillName} was restored in place and re-enabled.`));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setEnablingId(""); }
  }

  function recoveryActionLabel(action: LifecycleRecoveryAction): string {
    if (action === "restore-quarantine") return t("修复并恢复到回收站", "Repair and restore to trash");
    if (action === "clean-staging") return t("清理遗留目录", "Clean leftover directory");
    return t("重试事务对账", "Retry transaction reconciliation");
  }

  async function runRecoveryAction(issue: LifecycleRecoveryIssue, action: LifecycleRecoveryAction) {
    setRecoveryWorkingId(issue.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/lifecycle/recovery/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ issueId: issue.id, action }),
      });
      const payload = await response.json() as { outcome?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || t("恢复动作失败", "Recovery action failed"));
      setNotice(t("恢复动作已完成，并已重新对账。", "The recovery action completed and reconciliation was refreshed."));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRecoveryWorkingId(""); }
  }

  async function copyPath(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedPath(value);
    window.setTimeout(() => setCopiedPath((current) => current === value ? "" : current), 1500);
  }

  async function deleted(result: PermanentDeletionResult) {
    setOverview((current) => withoutRecord(current, result.trashId));
    setPurgeRecord(null);
    await load();
    if (result.auditStatus === "incomplete") {
      setNotice("");
      setWarning(t(
        `${result.skillName} 已永久删除，但最终审计记录未完成。请在下方恢复中心检查这笔事务。`,
        `${result.skillName} was permanently deleted, but its final audit record is incomplete. Review the transaction below.`,
      ));
    } else {
      setWarning("");
      setNotice(t(`${result.skillName} 已永久删除，无法恢复；审计记录已提交。`, `${result.skillName} was permanently deleted and cannot be restored; its audit record was committed.`));
    }
  }

  return (
    <>
      <section className="trash-overview" aria-label={t("回收站概览", "Trash overview")}>
        <article>
          <span>{t("可恢复 Skill", "Recoverable Skills")}</span>
          <strong>{overview.count}</strong>
        </article>
        <article>
          <span>{t("占用空间", "Storage used")}</span>
          <strong>{bytesLabel(overview.totalBytes, language)}</strong>
        </article>
        <article className="trash-root-card">
          <span>{t("回收站位置", "Trash location")}</span>
          <BreakablePath value={overview.rootPath} />
          <button className="icon-button" type="button" onClick={() => void copyPath(overview.rootPath)} aria-label={t("复制回收站位置", "Copy trash location")}>
            {copiedPath === overview.rootPath ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </article>
        <button className="button button-quiet trash-refresh" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "is-spinning" : undefined} />
          {loading ? t("正在刷新…", "Refreshing…") : t("刷新回收站", "Refresh trash")}
        </button>
      </section>

      <div className="trash-feedback" aria-live="polite">
        {notice && <p className="inline-success">{notice}</p>}
        {warning && <p className="inline-warning">{warning}</p>}
        {error && <p className="inline-error standalone">{error}</p>}
      </div>

      <section
        className={styles.recoveryCenter}
        data-healthy={overview.recovery.healthy}
        aria-labelledby="lifecycle-recovery-title"
      >
        <header className={styles.recoveryHeader}>
          <div className={styles.recoveryTitle}>
            <span className={styles.recoveryIcon}>
              {overview.recovery.healthy ? <CircleCheckBig size={22} /> : <ShieldAlert size={22} />}
            </span>
            <div>
              <span className="eyebrow">{t("生命周期对账 / 确定性修复", "LIFECYCLE RECONCILIATION / DETERMINISTIC REPAIR")}</span>
              <h2 id="lifecycle-recovery-title">{t("事务对账与恢复中心", "Transaction reconciliation and recovery")}</h2>
              <p>{t(
                "核对回收站、隔离区、更新暂存区和事务日志；只有通过重新验证的项目才会显示修复按钮。",
                "Reconciles trash, quarantine, update staging, and journals; repair buttons appear only after revalidation.",
              )}</p>
            </div>
          </div>
          <span className={styles.healthBadge} data-healthy={overview.recovery.healthy}>
            {overview.recovery.healthy
              ? t("对账正常", "RECONCILED")
              : t(`${overview.recovery.counts.total} 项需要检查`, `${overview.recovery.counts.total} NEED REVIEW`)}
          </span>
        </header>

        <div className={styles.recoveryMetrics}>
          <div><span>{t("回收站异常", "Trash issues")}</span><strong>{overview.recovery.counts.trash}</strong></div>
          <div><span>{t("隔离区遗留", "Quarantine leftovers")}</span><strong>{overview.recovery.counts.quarantine}</strong></div>
          <div><span>{t("事务 / 暂存异常", "Transaction / staging")}</span><strong>{overview.recovery.counts.transactions + overview.recovery.counts.staging}</strong></div>
          <div><span>{t("对账时间", "Inspected")}</span><strong className={styles.inspectedAt}>{new Date(overview.recovery.inspectedAt).toLocaleString(localeFor(language))}</strong></div>
        </div>

        <details className={styles.storageRoots}>
          <summary>{t("查看生命周期私有存储位置", "View private lifecycle storage locations")}</summary>
          <div><span>{t("回收站", "Trash")}</span><BreakablePath value={overview.recovery.roots.trashRoot} /></div>
          <div><span>{t("永久删除隔离区", "Purge quarantine")}</span><BreakablePath value={overview.recovery.roots.purgeRoot} /></div>
          <div><span>{t("事务日志", "Transaction journals")}</span><BreakablePath value={overview.recovery.roots.transactionRoot} /></div>
          <div><span>{t("更新备份", "Update backups")}</span><BreakablePath value={overview.recovery.roots.backupRoot} /></div>
          <div><span>{t("更新暂存区", "Update staging")}</span><BreakablePath value={overview.recovery.roots.stagingRoot} /></div>
          <div><span>{t("停用区", "Disabled area")}</span><BreakablePath value={overview.recovery.roots.disabledRoot} /></div>
        </details>

        {overview.recovery.healthy ? (
          <div className={styles.recoveryHealthy}>
            <CircleCheckBig size={20} />
            <div><strong>{t("没有发现未对账的生命周期状态", "No unreconciled lifecycle state found")}</strong><p>{t("回收站记录、隔离区和事务日志当前一致。", "Trash records, quarantine, and transaction journals are currently consistent.")}</p></div>
          </div>
        ) : (
          <div className={styles.recoveryIssues}>
            {overview.recovery.issues.map((issue) => {
              const copy = recoveryCopy(issue, language);
              return (
                <article key={issue.id} data-severity={issue.severity}>
                  <div className={styles.issueHeading}>
                    <AlertTriangle size={18} />
                    <div><strong>{copy.title}</strong><p>{copy.detail}</p></div>
                    <span data-recoverability={issue.recoverability}>{recoveryLabel(issue.recoverability, language)}</span>
                  </div>
                  <div className={styles.issueMeta}>
                    {issue.skillName && <code>${issue.skillName}</code>}
                    {issue.operation && <span>{issue.operation}</span>}
                    {issue.state && <span>{issue.state}</span>}
                    {issue.transactionId && <span>ID {issue.transactionId.slice(0, 12)}</span>}
                  </div>
                  <div className={styles.issuePath}>
                    <BreakablePath value={issue.location} />
                    <button className="icon-button" type="button" onClick={() => void copyPath(issue.location)} aria-label={t("复制异常位置", "Copy issue location")}>
                      {copiedPath === issue.location ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  {issue.relatedPath && <p className={styles.relatedPath}><span>{t("关联位置", "Related location")}</span><BreakablePath value={issue.relatedPath} /></p>}
                  {issue.diagnostic && <details className={styles.diagnostic}><summary>{t("诊断详情", "Diagnostic detail")}</summary><code>{issue.diagnostic}</code></details>}
                  {issue.availableActions?.length ? <div className={styles.issueActions}>{issue.availableActions.map((action) => <button key={action} className="button button-primary" type="button" disabled={recoveryWorkingId === issue.id} onClick={() => void runRecoveryAction(issue, action)}><RotateCcw size={14} />{recoveryWorkingId === issue.id ? t("正在重新验证…", "Revalidating…") : recoveryActionLabel(action)}</button>)}</div> : null}
                </article>
              );
            })}
            <p className={styles.readOnlyNote}>{t(
              "恢复中心不会自动改动文件。点击修复时会重新扫描、校验路径与指纹；条件不再成立就立即停止。",
              "The recovery center never changes files automatically. Each action rescans and revalidates paths and fingerprints, and stops if its proof no longer holds.",
            )}</p>
          </div>
        )}
      </section>

      {overview.disabledRecords.length ? <section className="trash-page-list disabled-skill-list" aria-label={t("已停用的 Skill", "Disabled Skills")}>
        <div className="lifecycle-list-heading"><div><PauseCircle size={20} /><div><h2>{t("已停用的 Skill", "Disabled Skills")}</h2><p>{t("这些 Skill 不会被 Codex 扫描，但完整目录仍保存在私有停用区。", "These Skills are not scanned by Codex, while their complete directories remain in the private disabled area.")}</p></div></div><strong>{overview.disabledCount}</strong></div>
        {overview.disabledRecords.map((record) => <article key={record.disabledId} data-state={record.state}>
          <header><div><span className="trash-record-icon"><PauseCircle size={19} /></span><div><strong>{record.displayName}</strong><code>${record.skillName}</code></div></div><span className="trash-state">{t("已停用", "DISABLED")}</span></header>
          <dl className="trash-record-metrics"><div><dt>{t("停用时间", "Disabled")}</dt><dd>{new Date(record.disabledAt).toLocaleString(localeFor(language))}</dd></div><div><dt>{t("文件", "Files")}</dt><dd>{record.fingerprint.fileCount}</dd></div><div><dt>{t("大小", "Size")}</dt><dd>{bytesLabel(record.fingerprint.totalBytes, language)}</dd></div></dl>
          <div className="trash-path-rail"><div><span>{t("原安装位置", "Original installation")}</span><BreakablePath value={record.originalDirectory} /></div><span>→</span><div><span>{t("当前停用位置", "Current disabled location")}</span><BreakablePath value={record.disabledDirectory} /></div></div>
          {record.failure && <p className="trash-failure">{record.failure}</p>}
          <footer><button className="button button-primary" type="button" disabled={enablingId === record.disabledId} onClick={() => void enable(record)}><RotateCcw size={15} />{enablingId === record.disabledId ? t("正在验证并启用…", "Verifying and enabling…") : t("原位重新启用", "Re-enable in place")}</button></footer>
        </article>)}
      </section> : null}

      {overview.records.length ? (
        <section className="trash-page-list" aria-label={t("回收站中的 Skill", "Skills in trash")}>
          {overview.records.map((record) => (
            <article key={record.trashId} data-state={record.state}>
              <header>
                <div>
                  <span className="trash-record-icon"><FolderArchive size={19} /></span>
                  <div><strong>{record.displayName}</strong><code>{"$"}{record.skillName}</code></div>
                </div>
                <span className="trash-state">{record.state === "failed" ? t("需要检查", "NEEDS REVIEW") : t("可恢复", "RECOVERABLE")}</span>
              </header>

              <dl className="trash-record-metrics">
                <div><dt>{t("移入时间", "Removed")}</dt><dd>{new Date(record.deletedAt).toLocaleString(localeFor(language))}</dd></div>
                <div><dt>{t("文件", "Files")}</dt><dd>{record.fingerprint.fileCount.toLocaleString(localeFor(language))}</dd></div>
                <div><dt>{t("大小", "Size")}</dt><dd>{bytesLabel(record.fingerprint.totalBytes, language)}</dd></div>
              </dl>

              <div className="trash-path-rail">
                <div>
                  <span>{t("原安装位置", "Original installation")}</span>
                  <BreakablePath value={record.originalDirectory} />
                  <button className="icon-button" type="button" onClick={() => void copyPath(record.originalDirectory)} aria-label={t("复制原安装位置", "Copy original installation path")}>
                    {copiedPath === record.originalDirectory ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <span>{t("当前存放位置", "Current location")}</span>
                  <BreakablePath value={record.trashDirectory} />
                  <button className="icon-button" type="button" onClick={() => void copyPath(record.trashDirectory)} aria-label={t("复制当前存放位置", "Copy current location")}>
                    {copiedPath === record.trashDirectory ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {record.failure && <p className="trash-failure">{record.failure}</p>}
              <footer>
                <button className="button button-primary" type="button" disabled={restoringId === record.trashId} onClick={() => void restore(record)}>
                  <ArchiveRestore size={15} />
                  {restoringId === record.trashId ? t("正在验证并恢复…", "Verifying and restoring…") : t("一键恢复", "Restore")}
                </button>
                <button className="button button-danger-quiet" type="button" onClick={() => setPurgeRecord(record)}>
                  <Trash2 size={15} /> {t("彻底删除…", "Permanently delete…")}
                </button>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className="trash-page-empty">
          <FileArchive size={34} />
          <strong>{t("回收站为空", "Trash is empty")}</strong>
          <p>{t("从“本地技能”移除的个人 Skill 会先安全存放在这里。", "Personal Skills removed from Local Skills will be stored here safely first.")}</p>
        </section>
      )}

      {purgeRecord && (
        <PermanentDeleteDialog
          record={purgeRecord}
          onClose={() => setPurgeRecord(null)}
          onDeleted={deleted}
        />
      )}
    </>
  );
}
