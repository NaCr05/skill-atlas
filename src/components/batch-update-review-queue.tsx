"use client";

import { AlertTriangle, CheckCircle2, FileDiff, PackageCheck, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { localizeLifecycleText } from "@/core/i18n";
import type { BatchUpdateRecord } from "@/core/lifecycle/update-batch";
import { BreakablePath } from "./breakable-path";
import type { SkillUpdatePreview, SkillUpdateResult } from "@/core/lifecycle/types";
import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";

type QueueStatus = "pending" | "updated" | "skipped" | "failed";

interface QueueItem extends BatchUpdateRecord {
  queueStatus: QueueStatus;
  message?: string;
}

export function BatchUpdateReviewQueue({
  records,
  onClose,
  onComplete,
}: {
  records: BatchUpdateRecord[];
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<QueueItem[]>(() => records.map((record) => ({ ...record, queueStatus: "pending" })));
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<SkillUpdatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const current = items[index];
  const finished = index >= items.length;
  const changedFiles = useMemo(() => preview?.changes.filter((change) => change.kind !== "unchanged") || [], [preview]);

  useEffect(() => {
    if (!current || finished) return;
    const controller = new AbortController();
    let active = true;
    void fetch("/api/updates/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
      body: JSON.stringify({ skillId: current.skillId }),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as SkillUpdatePreview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法生成更新审查", "Unable to prepare the update review"));
      if (active) setPreview(payload);
    }).catch((cause) => {
      if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [current, finished, language, t]);

  function advance(status: QueueStatus, message?: string) {
    setItems((existing) => existing.map((item, itemIndex) => itemIndex === index ? { ...item, queueStatus: status, message } : item));
    setPreview(null);
    setConfirmed(false);
    setError("");
    setLoading(true);
    setIndex((value) => value + 1);
  }

  async function applyUpdate() {
    if (!preview?.updateAllowed || !confirmed) return;
    setApplying(true);
    setError("");
    try {
      const response = await fetch("/api/updates/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ previewId: preview.previewId }),
      });
      const payload = await response.json() as SkillUpdateResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("安全更新失败", "Safe update failed"));
      advance("updated", payload.revision.slice(0, 12));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setItems((existing) => existing.map((item, itemIndex) => itemIndex === index ? { ...item, queueStatus: "failed", message } : item));
    } finally {
      setApplying(false);
    }
  }

  async function finish() {
    await onComplete();
    onClose();
  }

  const updatedCount = items.filter((item) => item.queueStatus === "updated").length;
  const skippedCount = items.filter((item) => item.queueStatus === "skipped").length;
  const failedCount = items.filter((item) => item.queueStatus === "failed").length;

  return (
    <AccessibleDialog
      className="installation-dialog batch-update-dialog"
      labelledBy="batch-update-title"
      onClose={onClose}
      closeDisabled={applying}
      busy={loading || applying}
      initialFocusSelector={finished ? "#batch-update-finish" : undefined}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">{t("批量更新 / 逐项审查", "BATCH UPDATE / ITEM-BY-ITEM REVIEW")}</span>
          <h2 id="batch-update-title"><PackageCheck size={20} /> {t("安全更新队列", "Safe update queue")}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} disabled={applying} aria-label={t("关闭", "Close")}><X size={20} /></button>
      </div>

      <div className="batch-update-progress" aria-label={t("更新队列进度", "Update queue progress")}>
        {items.map((item, itemIndex) => <span key={item.skillId} data-state={itemIndex === index ? "current" : item.queueStatus} title={item.skillName}>{itemIndex + 1}</span>)}
      </div>

      {finished ? (
        <div className="batch-update-complete">
          <CheckCircle2 size={36} />
          <h3>{t("更新审查队列已完成", "Update review queue complete")}</h3>
          <p>{t(`已更新 ${updatedCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个。`, `${updatedCount} updated, ${skippedCount} skipped, ${failedCount} failed.`)}</p>
          <div className="batch-update-results">{items.map((item) => <div key={item.skillId} data-state={item.queueStatus}><strong>{item.skillName}</strong><span>{queueStatusLabel(item.queueStatus, language)}</span>{item.message && <small>{item.message}</small>}</div>)}</div>
        </div>
      ) : (
        <div className="batch-update-review">
          <header><span>{t(`第 ${index + 1} 项，共 ${items.length} 项`, `Item ${index + 1} of ${items.length}`)}</span><h3>{current.skillName}</h3><code>{current.sourceUrl}</code></header>
          {loading && <p className="operations-empty">{t("正在重新读取上游并生成最新差异…", "Refreshing upstream data and preparing a fresh diff…")}</p>}
          {preview && <>
            <div className="change-metrics">
              <div data-kind="added"><strong>+{preview.summary.added}</strong><span>{t("新增", "Added")}</span></div>
              <div data-kind="modified"><strong>~{preview.summary.modified}</strong><span>{t("修改", "Modified")}</span></div>
              <div data-kind="removed"><strong>-{preview.summary.removed}</strong><span>{t("删除", "Removed")}</span></div>
              <div data-kind="unchanged"><strong>{preview.summary.unchanged}</strong><span>{t("未变化", "Unchanged")}</span></div>
            </div>
            <div className="batch-update-diff"><h4><FileDiff size={15} /> {t("文件差异", "File differences")}</h4>{changedFiles.length ? changedFiles.slice(0, 80).map((change) => <div key={`${change.kind}-${change.path}`} data-kind={change.kind}><b>{change.kind === "added" ? "+" : change.kind === "modified" ? "~" : "−"}</b><BreakablePath value={change.path} /></div>) : <p>{t("本地内容已经与上游一致。", "Local content already matches upstream.")}</p>}</div>
            <div className="update-risk-list">{preview.risks.map((risk) => <article key={risk.code} data-level={risk.level}>{risk.level === "info" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<div><strong>{localizeLifecycleText(risk.title, language)}</strong><p>{localizeLifecycleText(risk.detail, language)}</p></div></article>)}</div>
            {preview.updateAllowed && <label className="confirmation-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("我已逐项检查本次差异，同意先完整备份当前版本，再执行已验证的原子更新。", "I reviewed this diff and approve a complete backup followed by the verified atomic update.")}</span></label>}
            {!preview.updateAllowed && <p className="inline-notice">{preview.status === "up-to-date" ? t("该 Skill 已是最新版本，可以跳过。", "This Skill is already up to date and can be skipped.") : t("当前审查包含阻断风险，不能更新。", "This review contains a blocking risk and cannot be applied.")}</p>}
          </>}
          {error && <p className="inline-error">{error}</p>}
        </div>
      )}

      <div className="dialog-actions">
        {finished ? <button id="batch-update-finish" className="button button-primary" type="button" onClick={() => void finish()}>{t("完成并刷新", "Finish and refresh")}</button> : <>
          <button className="button button-quiet" type="button" disabled={applying} onClick={() => advance("skipped")}><SkipForward size={15} />{t("跳过此项", "Skip item")}</button>
          <button className="button button-primary" type="button" disabled={!preview?.updateAllowed || !confirmed || applying} onClick={() => void applyUpdate()}><PackageCheck size={15} />{applying ? t("正在备份并更新…", "Backing up and updating…") : t("确认更新并继续", "Update and continue")}</button>
        </>}
      </div>
    </AccessibleDialog>
  );
}

function queueStatusLabel(status: QueueStatus, language: "zh" | "en") {
  const labels: Record<QueueStatus, [string, string]> = {
    pending: ["未处理", "Pending"], updated: ["已更新", "Updated"], skipped: ["已跳过", "Skipped"], failed: ["失败", "Failed"],
  };
  return labels[status][language === "zh" ? 0 : 1];
}
