"use client";

import { AlertTriangle, Archive, Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { DuplicateMigrationResult, DuplicateMigrationReview } from "@/core/issues/duplicate-migration";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

export function DuplicateMigrationDialog({ skillId, onClose, onMigrated }: { skillId: string; onClose: () => void; onMigrated: (result: DuplicateMigrationResult) => void | Promise<void> }) {
  const { language, t } = useLanguage();
  const [review, setReview] = useState<DuplicateMigrationReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/issues/migrate/inspect", { method: "POST", headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language }, body: JSON.stringify({ skillId }) })
      .then(async (response) => { const payload = await response.json() as DuplicateMigrationReview & { error?: string }; if (!response.ok) throw new Error(payload.error || t("无法生成迁移审查", "Unable to prepare migration review")); if (active) setReview(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [language, skillId, t]);
  async function confirm() {
    if (!review) return; setWorking(true); setError("");
    try {
      const response = await fetch("/api/issues/migrate/confirm", { method: "POST", headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language }, body: JSON.stringify({ planId: review.planId }) });
      const payload = await response.json() as DuplicateMigrationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("迁移失败", "Migration failed"));
      await onMigrated(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }
  return <AccessibleDialog className="installation-dialog removal-dialog" labelledBy="migration-review-title" onClose={onClose} closeDisabled={working} busy={!review || working}>
    <div className="dialog-heading"><div><span className="eyebrow">{t("重复入口 / 逐项审查", "DUPLICATE ENTRY / INDIVIDUAL REVIEW")}</span><h2 id="migration-review-title"><Archive size={20} /> {t("迁移重复兼容入口", "Migrate duplicate compatibility entry")}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={working} aria-label={t("关闭", "Close")}><X size={20} /></button></div>
    {!review && !error && <div className="lifecycle-loading"><ShieldCheck size={22} /><strong>{t("正在重新验证重复组、路径和完整指纹…", "Revalidating the duplicate group, path, and complete fingerprint…")}</strong></div>}
    {review && <>
      <div className="review-route"><div><span>{t("当前兼容入口", "Compatibility entry")}</span><strong>{review.skillName}</strong><BreakablePath value={review.sourceDirectory} /></div><span>→</span><div><span>{t("私有迁移归档", "Private migration archive")}</span><BreakablePath value={review.archiveRoot} /><small>{t("首选重复入口保持活动", "The preferred duplicate remains active")}</small></div></div>
      <div className="risk-list">{review.risks.map((risk) => <article key={risk.title} data-level={risk.level}>{risk.level === "blocked" ? <AlertTriangle size={17} /> : <Check size={17} />}<div><strong>{risk.level === "blocked" ? t("无法安全迁移", "Cannot migrate safely") : t("完整归档并保留指纹", "Complete archive with retained fingerprint")}</strong><p>{risk.detail}</p></div></article>)}</div>
      {review.migrationAllowed && <label className="confirmation-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("我确认将这个兼容目录移出活动 Skill 入口，并保存在 Skill Atlas 私有归档中。", "I confirm moving this compatibility directory out of active Skill discovery into the private Skill Atlas archive.")}</span></label>}
    </>}
    {error && <p className="inline-error">{error}</p>}
    <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose} disabled={working}>{t("取消", "Cancel")}</button><button className="button button-primary" type="button" disabled={!review?.migrationAllowed || !confirmed || working} onClick={() => void confirm()}><Archive size={15} />{working ? t("正在迁移…", "Migrating…") : t("确认迁移", "Confirm migration")}</button></div>
  </AccessibleDialog>;
}
