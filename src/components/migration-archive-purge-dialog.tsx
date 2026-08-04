"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { MigrationArchivePurgeResult, MigrationArchivePurgeReview } from "@/core/issues/migration-archive";
import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";

export function MigrationArchivePurgeDialog({ migrationId, onClose, onPurged }: { migrationId: string; onClose: () => void; onPurged: (result: MigrationArchivePurgeResult) => void | Promise<void> }) {
  const { language, t } = useLanguage();
  const [review, setReview] = useState<MigrationArchivePurgeReview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/issues/migrations/purge/inspect", { method: "POST", headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language }, body: JSON.stringify({ migrationId }) })
      .then(async (response) => { const payload = await response.json() as MigrationArchivePurgeReview & { error?: string }; if (!response.ok) throw new Error(payload.error || t("无法生成永久清理审查单", "Unable to prepare permanent cleanup review")); if (active) setReview(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [language, migrationId, t]);
  async function purge() {
    if (!review || confirmation !== review.confirmationText) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/issues/migrations/purge/confirm", { method: "POST", headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language }, body: JSON.stringify({ planId: review.planId, confirmationText: confirmation }) });
      const payload = await response.json() as MigrationArchivePurgeResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("永久清理失败", "Permanent cleanup failed"));
      await onPurged(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }
  return <AccessibleDialog className="installation-dialog removal-dialog" labelledBy="migration-purge-title" onClose={onClose} closeDisabled={working} initialFocusSelector="#migration-purge-confirmation" busy={!review || working}>
    <div className="dialog-heading"><div><span className="eyebrow">MIGRATION ARCHIVE / PERMANENT CLEANUP</span><h2 id="migration-purge-title"><Trash2 size={20} /> {t("彻底清理迁移归档", "Permanently remove migration archive")}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={working} aria-label={t("关闭", "Close")}><X size={20} /></button></div>
    {review && <><div className="destructive-warning"><AlertTriangle size={20} /><div><strong>{t("此操作无法恢复", "This cannot be undone")}</strong><p>{t(`归档中的 ${review.fingerprint.fileCount} 个文件将被永久删除。请输入完整 Skill 名称继续。`, `${review.fingerprint.fileCount} archived files will be permanently deleted. Enter the exact Skill name to continue.`)}</p></div></div><label className="destructive-confirmation"><span>{t(`输入 ${review.confirmationText}`, `Enter ${review.confirmationText}`)}</span><input id="migration-purge-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label></>}
    {error && <p className="inline-error">{error}</p>}
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose} disabled={working}>{t("取消", "Cancel")}</button><button className="button button-danger" type="button" disabled={!review || confirmation !== review.confirmationText || working} onClick={() => void purge()}><Trash2 size={15} />{working ? t("正在永久清理…", "Removing permanently…") : t("永久清理归档", "Permanently remove archive")}</button></div>
  </AccessibleDialog>;
}
