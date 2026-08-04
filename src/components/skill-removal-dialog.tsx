"use client";

import { AlertTriangle, ArchiveRestore, Check, FileArchive, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  SkillRemovalResult,
  SkillRemovalReview,
  SkillRemovalRisk,
} from "@/core/lifecycle/types";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

function riskCopy(
  risk: SkillRemovalRisk,
  review: SkillRemovalReview,
  language: "zh" | "en",
): { title: string; detail: string } {
  if (language === "zh") return { title: risk.title, detail: risk.detail };
  if (risk.code === "personal-skill") {
    return {
      title: "Personal, manageable Skill",
      detail: "Only this personal directory will be deactivated. System, plugin, and shared sources remain untouched.",
    };
  }
  if (risk.code === "complete-backup") {
    return {
      title: "The complete directory will remain in the Skill Atlas trash",
      detail: String(review.fingerprint.fileCount) + " files and " + String(review.fingerprint.totalBytes) + " bytes can be restored to the original directory.",
    };
  }
  if (risk.code === "hard-dependents") {
    return {
      title: "Other Skills still declare it as a required dependency",
      detail: review.hardDependents.map((entry) => entry.displayName).join(", "),
    };
  }
  if (risk.code === "instruction-references") {
    return {
      title: "Other Skill instructions still reference it",
      detail: review.instructionReferences.map((entry) => entry.displayName).join(", "),
    };
  }
  if (risk.code === "unsupported-path") {
    return {
      title: "A complete safe snapshot could not be created",
      detail: "The directory contains unsupported links or exceeds the bounded file limit.",
    };
  }
  return {
    title: "This source is read-only",
    detail: "Only personal Skills managed by Skill Atlas can be moved to the trash.",
  };
}

export function SkillRemovalDialog({
  skillId,
  onClose,
  onRemoved,
}: {
  skillId: string;
  onClose: () => void;
  onRemoved: (result: SkillRemovalResult) => void | Promise<void>;
}) {
  const { language, t } = useLanguage();
  const [review, setReview] = useState<SkillRemovalReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function inspect() {
      try {
        const response = await fetch("/api/lifecycle/uninstall/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
          body: JSON.stringify({ skillId }),
        });
        const payload = (await response.json()) as SkillRemovalReview & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || t("无法生成删除审查单", "Unable to prepare the removal review"));
        }
        if (active) setReview(payload);
      } catch (inspectionError) {
        if (active) {
          setError(
            inspectionError instanceof Error
              ? inspectionError.message
              : t("无法生成删除审查单", "Unable to prepare the removal review"),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void inspect();
    return () => {
      active = false;
    };
  }, [language, skillId, t]);

  async function removeSkill() {
    if (!review) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/lifecycle/uninstall/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ planId: review.planId }),
      });
      const payload = (await response.json()) as SkillRemovalResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t("无法移入回收站", "Unable to move the Skill to trash"));
      }
      await onRemoved(payload);
    } catch (removalError) {
      setError(
        removalError instanceof Error
          ? removalError.message
          : t("无法移入回收站", "Unable to move the Skill to trash"),
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <AccessibleDialog
      className="installation-dialog removal-dialog"
      labelledBy="skill-removal-title"
      onClose={onClose}
      closeDisabled={working}
      busy={loading || working}
    >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("生命周期检查点", "LIFECYCLE CHECKPOINT")}</span>
            <h2 id="skill-removal-title">
              <Trash2 size={20} /> {t("移到 Skill 回收站", "Move Skill to trash")}
              {review ? " · " + review.displayName : ""}
            </h2>
          </div>
          <button className="icon-button" type="button" disabled={working} onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="lifecycle-loading" role="status">
            <ShieldCheck size={22} />
            <strong>{t("正在重新检查路径、权限、依赖和完整指纹…", "Rechecking path, permission, dependencies, and the complete fingerprint…")}</strong>
          </div>
        )}

        {review && (
          <>
            <div className="review-route removal-route">
              <div>
                <span>{t("当前安装目录", "Current installation")}</span>
                <strong>{review.skillName}</strong>
                <BreakablePath value={review.directoryPath} />
                <small>{t("指纹", "Fingerprint")}: {review.fingerprint.value.slice(0, 16)}</small>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span>{t("安全目标", "Safe destination")}</span>
                <strong>{t("Skill Atlas 私有回收站", "Private Skill Atlas trash")}</strong>
                <small>{t("完整目录保留，可撤销或稍后恢复", "Complete directory retained for undo or later restore")}</small>
              </div>
            </div>

            <div className="removal-summary">
              <div><FileArchive size={17} /><span>{t("文件", "Files")}</span><strong>{review.fingerprint.fileCount}</strong></div>
              <div><ArchiveRestore size={17} /><span>{t("可恢复数据", "Recoverable data")}</span><strong>{review.fingerprint.totalBytes.toLocaleString()} B</strong></div>
              <div><ShieldCheck size={17} /><span>{t("硬依赖方", "Hard dependents")}</span><strong>{review.hardDependents.length}</strong></div>
            </div>

            <div className="risk-list removal-risk-list">
              {review.risks.map((risk) => {
                const copy = riskCopy(risk, review, language);
                return (
                  <article key={risk.code} data-level={risk.level}>
                    {risk.level === "blocked" ? <AlertTriangle size={17} /> : <Check size={17} />}
                    <div><strong>{copy.title}</strong><p>{copy.detail}</p></div>
                  </article>
                );
              })}
            </div>

            <p className="deterministic-review-note">
              <ShieldCheck size={15} />
              {t("这项审查完全由本机确定性规则完成，不调用外部 AI，也不会执行 Skill 中的脚本。", "This review uses deterministic local rules only. It does not call external AI or execute scripts from the Skill.")}
            </p>

            {review.removalAllowed ? (
              <label className="confirmation-row destructive-confirmation">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{t("我确认把这个完整 Skill 目录移入可恢复的 Skill Atlas 回收站。", "I confirm moving this complete Skill directory to the recoverable Skill Atlas trash.")}</span>
              </label>
            ) : (
              <p className="blocked-notice">{t("存在阻断风险；请先处理上方依赖或目录问题。", "Blocking risks must be resolved before this Skill can be removed.")}</p>
            )}
          </>
        )}

        {error && <p className="inline-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" disabled={working} onClick={onClose}>{t("取消", "Cancel")}</button>
          <button
            className="button button-danger"
            type="button"
            disabled={!review?.removalAllowed || !confirmed || working}
            onClick={() => void removeSkill()}
          >
            <Trash2 size={15} />
            {working ? t("验证并移动中…", "Verifying and moving…") : t("确认移到回收站", "Confirm move to trash")}
          </button>
        </div>
    </AccessibleDialog>
  );
}
