"use client";

import { ArchiveRestore, DatabaseBackup, HardDrive, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ManagedStorageEntry, StorageCleanupReview, StorageOverview } from "@/core/storage/storage-manager";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function StorageManagerClient({ initialOverview }: { initialOverview: StorageOverview }) {
  const { language, t } = useLanguage();
  const [overview, setOverview] = useState(initialOverview);
  const [review, setReview] = useState<StorageCleanupReview>();
  const [confirmation, setConfirmation] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const headers = { "Content-Type": "application/json", "X-Skill-Atlas-Language": language };

  async function refresh() {
    const response = await fetch("/api/storage", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } });
    const payload = await response.json() as StorageOverview & { error?: string };
    if (!response.ok) throw new Error(payload.error || t("无法刷新存储信息。", "Could not refresh storage."));
    setOverview(payload);
  }

  async function inspect(entry: ManagedStorageEntry) {
    setLoadingId(`${entry.kind}:${entry.id}`);
    setMessage(undefined);
    try {
      const response = await fetch("/api/storage/cleanup/inspect", { method: "POST", headers, body: JSON.stringify({ kind: entry.kind, id: entry.id }) });
      const payload = await response.json() as StorageCleanupReview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法生成清理审查。", "Could not create cleanup review."));
      setReview(payload);
      setConfirmation("");
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setLoadingId(""); }
  }

  async function confirm() {
    if (!review) return;
    setBusy(true);
    try {
      const response = await fetch("/api/storage/cleanup/confirm", { method: "POST", headers, body: JSON.stringify({ planId: review.planId, confirmationText: confirmation }) });
      const payload = await response.json() as { skillName?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || t("清理失败。", "Cleanup failed."));
      setReview(undefined);
      setConfirmation("");
      setMessage({ kind: "success", text: t(`${payload.skillName} 的私有存储已安全清理。`, `Private storage for ${payload.skillName} was safely cleaned.`) });
      await refresh();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }

  const groups: Array<{ title: string; subtitle: string; root: string; entries: ManagedStorageEntry[] }> = [
    { title: t("更新备份", "Update backups"), subtitle: t("用于更新失败回滚的已验证旧版本", "Verified previous versions retained for update rollback"), root: overview.roots.backups, entries: overview.updateBackups },
    { title: t("停用目录", "Disabled Skills"), subtitle: t("已从生效目录移出、仍可重新启用的完整 Skill", "Complete Skills moved out of the active directory and still re-enableable"), root: overview.roots.disabled, entries: overview.disabled },
  ];

  return <div className="storage-manager">
    <section className="storage-overview">
      <article><HardDrive size={20} /><span>{t("受管存储占用", "Managed storage")}</span><strong>{bytes(overview.totalBytes)}</strong></article>
      <article><DatabaseBackup size={20} /><span>{t("更新备份", "Update backups")}</span><strong>{overview.updateBackups.length}</strong></article>
      <article><ArchiveRestore size={20} /><span>{t("停用与归档", "Disabled & archived")}</span><strong>{overview.disabled.length + overview.migrations.count}</strong></article>
      <button className="button button-quiet" type="button" onClick={() => void refresh()}><RefreshCw size={15} />{t("重新统计", "Refresh")}</button>
    </section>
    {message && <p className={message.kind === "error" ? "inline-error standalone" : "inline-notice standalone"}>{message.text}</p>}
    {groups.map((group) => <section className="storage-section" key={group.title}>
      <header><div><h2>{group.title}</h2><p>{group.subtitle}</p><BreakablePath value={group.root} /></div></header>
      <div className="storage-entry-list">{group.entries.length ? group.entries.map((entry) => <article key={`${entry.kind}:${entry.id}`}>
        <div><strong>{entry.skillName}</strong><span>{bytes(entry.fingerprint.totalBytes)} · {entry.fingerprint.fileCount} {t("个文件", "files")}</span></div>
        <BreakablePath value={entry.directory} />
        {entry.diagnostic && <p className="storage-warning">{language === "zh" ? "该备份的指纹或关联事务状态不满足安全清理条件，请先到恢复中心检查。" : entry.diagnostic}</p>}
        <div className="storage-entry-actions">{entry.kind === "disabled" && <Link className="button button-quiet" href="/trash"><ArchiveRestore size={14} />{t("前往重新启用", "Go to re-enable")}</Link>}<button className="button button-danger" type="button" disabled={!entry.cleanupAllowed || Boolean(loadingId)} onClick={() => void inspect(entry)}><Trash2 size={14} />{loadingId === `${entry.kind}:${entry.id}` ? t("正在审查…", "Reviewing…") : t("审查清理", "Review cleanup")}</button></div>
      </article>) : <p className="operations-empty">{t("这里暂无受管内容。", "No managed content here.")}</p>}</div>
    </section>)}
    <section className="storage-section">
      <header><div><h2>{t("重复入口归档", "Duplicate-entry archives")}</h2><p>{t("完整迁移归档保留原位置和指纹，可恢复或二次确认后清理。", "Complete migration archives retain their original location and fingerprint for restore or reviewed cleanup.")}</p><BreakablePath value={overview.roots.migrations} /></div><Link className="button button-quiet" href="/operations">{t("管理恢复与清理", "Manage restore & cleanup")}</Link></header>
      <div className="storage-entry-list">{overview.migrations.records.length ? overview.migrations.records.map((entry) => <article key={entry.migrationId}><div><strong>{entry.skillName}</strong><span>{entry.health === "ready" ? t("指纹有效", "Fingerprint valid") : t("需要人工检查", "Needs review")}</span></div><BreakablePath value={entry.archivedDirectory} /></article>) : <p className="operations-empty">{t("暂无迁移归档。", "No migration archives.")}</p>}</div>
    </section>
    {review && <AccessibleDialog className="review-dialog storage-cleanup-dialog" labelledBy="storage-cleanup-title" describedBy="storage-cleanup-description" onClose={() => !busy && setReview(undefined)} closeDisabled={busy} initialFocusSelector="[data-dialog-close]" busy={busy}>
      <header><div><span className="eyebrow">{t("不可恢复操作", "IRREVERSIBLE ACTION")}</span><h2 id="storage-cleanup-title"><ShieldCheck size={20} /> {t("确认清理私有副本", "Confirm private-copy cleanup")}</h2></div><button data-dialog-close className="icon-button" type="button" onClick={() => setReview(undefined)} disabled={busy} aria-label={t("关闭", "Close")}><X size={18} /></button></header>
      <p id="storage-cleanup-description">{t("系统会再次验证目录与指纹，先隔离再删除。完成后不能从 Skill Atlas 恢复。", "The directory and fingerprint are verified again, then quarantined before deletion. Skill Atlas cannot restore it afterward.")}</p>
      <dl><div><dt>{t("Skill", "Skill")}</dt><dd>{review.skillName}</dd></div><div><dt>{t("大小", "Size")}</dt><dd>{bytes(review.fingerprint.totalBytes)}</dd></div><div><dt>{t("位置", "Location")}</dt><dd><BreakablePath value={review.directory} /></dd></div></dl>
      <label><span>{t(`请输入 ${review.confirmationText} 继续`, `Type ${review.confirmationText} to continue`)}</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
      <footer><button className="button button-quiet" type="button" onClick={() => setReview(undefined)} disabled={busy}>{t("取消", "Cancel")}</button><button className="button button-danger" type="button" onClick={() => void confirm()} disabled={busy || confirmation !== review.confirmationText}><Trash2 size={15} />{busy ? t("正在清理…", "Cleaning…") : t("永久清理", "Permanently clean")}</button></footer>
    </AccessibleDialog>}
  </div>;
}
