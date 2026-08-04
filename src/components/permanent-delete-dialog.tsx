"use client";

import { AlertTriangle, FileArchive, Fingerprint, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  PermanentDeletionResult,
  PermanentDeletionReview,
  TrashedSkillRecord,
} from "@/core/lifecycle/types";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

export function PermanentDeleteDialog({
  record,
  onClose,
  onDeleted,
}: {
  record: TrashedSkillRecord;
  onClose: () => void;
  onDeleted: (result: PermanentDeletionResult) => void | Promise<void>;
}) {
  const { language, t } = useLanguage();
  const [review, setReview] = useState<PermanentDeletionReview | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function inspect() {
      try {
        const response = await fetch("/api/lifecycle/purge/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
          body: JSON.stringify({ trashId: record.trashId }),
        });
        const payload = (await response.json()) as PermanentDeletionReview & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || t("无法生成永久删除审查单", "Unable to prepare the permanent-deletion review"));
        }
        if (active) setReview(payload);
      } catch (inspectionError) {
        if (active) {
          setError(inspectionError instanceof Error
            ? inspectionError.message
            : t("无法生成永久删除审查单", "Unable to prepare the permanent-deletion review"));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void inspect();
    return () => {
      active = false;
    };
  }, [language, record.trashId, t]);

  async function permanentlyDelete() {
    if (!review || confirmationText !== review.confirmationText) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/lifecycle/purge/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({
          planId: review.planId,
          confirmationText,
        }),
      });
      const payload = (await response.json()) as PermanentDeletionResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t("永久删除失败", "Permanent deletion failed"));
      }
      await onDeleted(payload);
    } catch (deletionError) {
      setError(deletionError instanceof Error
        ? deletionError.message
        : t("永久删除失败", "Permanent deletion failed"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <AccessibleDialog
      className="installation-dialog permanent-delete-dialog"
      labelledBy="permanent-delete-title"
      onClose={onClose}
      closeDisabled={working}
      busy={loading || working}
    >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("不可逆生命周期操作", "IRREVERSIBLE LIFECYCLE ACTION")}</span>
            <h2 id="permanent-delete-title"><Trash2 size={20} /> {t("彻底删除", "Permanently delete")} · {record.displayName}</h2>
          </div>
          <button className="icon-button" type="button" disabled={working} onClick={onClose} aria-label={t("关闭", "Close")}><X size={20} /></button>
        </div>

        {loading && (
          <div className="lifecycle-loading" role="status">
            <ShieldCheck size={22} />
            <strong>{t("正在重新验证路径、记录和完整指纹…", "Revalidating the path, record, and complete fingerprint…")}</strong>
          </div>
        )}

        {review && (
          <>
            <div className="permanent-delete-warning">
              <AlertTriangle size={20} />
              <div>
                <strong>{t("删除后无法恢复", "This cannot be undone")}</strong>
                <p>{t("完整 Skill 目录和回收站记录都会被删除，只保留不含文件内容的事务审计记录。", "The complete Skill directory and trash record will be deleted. Only an audit transaction without file contents remains.")}</p>
              </div>
            </div>

            <div className="removal-summary">
              <div><FileArchive size={17} /><span>{t("文件", "Files")}</span><strong>{review.fingerprint.fileCount}</strong></div>
              <div><Trash2 size={17} /><span>{t("永久释放", "Freed permanently")}</span><strong>{review.fingerprint.totalBytes.toLocaleString()} B</strong></div>
              <div><Fingerprint size={17} /><span>{t("指纹", "Fingerprint")}</span><strong>{review.fingerprint.value.slice(0, 12)}</strong></div>
            </div>

            <div className="permanent-delete-paths">
              <div><span>{t("原安装位置", "Original installation")}</span><BreakablePath value={review.originalDirectory} /></div>
              <div><span>{t("当前回收站位置", "Current trash location")}</span><BreakablePath value={review.trashDirectory} /></div>
            </div>

            <label className="permanent-delete-confirmation">
              <span>{t("输入完整 Skill 名称以确认", "Type the complete Skill name to confirm")}: <code>{review.confirmationText}</code></span>
              <input
                type="text"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder={review.confirmationText}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <p className="deterministic-review-note">
              <ShieldCheck size={15} />
              {t("审查与删除均由本机确定性规则执行，不调用外部 AI，也不会执行 Skill 中的脚本。", "Review and deletion use deterministic local rules only. No external AI is called and no Skill script is executed.")}
            </p>
          </>
        )}

        {error && <p className="inline-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" disabled={working} onClick={onClose}>{t("取消", "Cancel")}</button>
          <button
            className="button button-danger"
            type="button"
            disabled={!review || confirmationText !== review.confirmationText || working}
            onClick={() => void permanentlyDelete()}
          >
            <Trash2 size={15} />
            {working ? t("正在永久删除…", "Permanently deleting…") : t(`永久删除 ${record.skillName}`, `Permanently delete ${record.skillName}`)}
          </button>
        </div>
    </AccessibleDialog>
  );
}
