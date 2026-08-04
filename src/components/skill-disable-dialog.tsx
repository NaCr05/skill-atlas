"use client";

import { AlertTriangle, Check, PauseCircle, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { SkillDisableResult, SkillDisableReview, SkillDisableRisk } from "@/core/lifecycle/types";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

function riskCopy(risk: SkillDisableRisk, review: SkillDisableReview, language: "zh" | "en") {
  const zh = language === "zh";
  if (risk.code === "personal-skill") return zh
    ? { title: "个人可管理 Skill", detail: "只会停用这个个人目录，不会修改系统、插件或共享目录。" }
    : { title: "Personal manageable Skill", detail: "Only this personal directory will be disabled; system, plugin, and shared Skills remain untouched." };
  if (risk.code === "complete-private-copy") return zh
    ? { title: "完整目录移入私有停用区", detail: `${review.fingerprint.fileCount} 个文件会保持完整，可原位重新启用。` }
    : { title: "Complete private disabled copy", detail: `${review.fingerprint.fileCount} files remain intact and can be restored in place.` };
  if (risk.code === "hard-dependents") return zh
    ? { title: "其他 Skill 仍依赖它", detail: review.hardDependents.map((item) => item.displayName).join("、") }
    : { title: "Other Skills still require it", detail: review.hardDependents.map((item) => item.displayName).join(", ") };
  return zh
    ? { title: "无法生成完整安全快照", detail: "目录包含不支持的链接或超过安全文件数量上限。" }
    : { title: "A complete safe snapshot could not be created", detail: "The directory contains unsupported links or exceeds the safe file limit." };
}

export function SkillDisableDialog({ skillId, onClose, onDisabled }: {
  skillId: string;
  onClose: () => void;
  onDisabled: (result: SkillDisableResult) => void | Promise<void>;
}) {
  const { language, t } = useLanguage();
  const [review, setReview] = useState<SkillDisableReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/lifecycle/disable/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
      body: JSON.stringify({ skillId }),
    }).then(async (response) => {
      const payload = await response.json() as SkillDisableReview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法生成停用审查单", "Unable to prepare the disable review"));
      if (active) setReview(payload);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [language, skillId, t]);

  async function confirm() {
    if (!review) return;
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/lifecycle/disable/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ planId: review.planId }),
      });
      const payload = await response.json() as SkillDisableResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("停用失败", "Disable failed"));
      await onDisabled(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }

  return (
    <AccessibleDialog className="installation-dialog removal-dialog" labelledBy="skill-disable-title" onClose={onClose} closeDisabled={working} busy={loading || working}>
      <div className="dialog-heading">
        <div><span className="eyebrow">{t("生命周期检查点", "LIFECYCLE CHECKPOINT")}</span><h2 id="skill-disable-title"><PauseCircle size={20} /> {t("停用 Skill", "Disable Skill")}{review ? ` · ${review.displayName}` : ""}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} disabled={working} aria-label={t("关闭", "Close")}><X size={20} /></button>
      </div>
      {loading && <div className="lifecycle-loading" role="status"><ShieldCheck size={22} /><strong>{t("正在检查目录、依赖和完整指纹…", "Checking directory, dependencies, and complete fingerprint…")}</strong></div>}
      {review && <>
        <div className="review-route removal-route"><div><span>{t("当前安装目录", "Current installation")}</span><strong>{review.skillName}</strong><BreakablePath value={review.directoryPath} /></div><span>→</span><div><span>{t("安全目标", "Safe destination")}</span><strong>{t("Skill Atlas 私有停用区", "Private Skill Atlas disabled area")}</strong><small>{t("不会被 Codex 扫描，可原位重新启用", "Not scanned by Codex; can be re-enabled in place")}</small></div></div>
        <div className="risk-list removal-risk-list">{review.risks.map((risk) => { const copy = riskCopy(risk, review, language); return <article key={risk.code} data-level={risk.level}>{risk.level === "blocked" ? <AlertTriangle size={17} /> : <Check size={17} />}<div><strong>{copy.title}</strong><p>{copy.detail}</p></div></article>; })}</div>
        <p className="deterministic-review-note"><ShieldCheck size={15} />{t("停用只移动完整目录，不执行 Skill 脚本，也不调用外部 AI。", "Disable only moves the complete directory; it does not execute Skill scripts or call external AI.")}</p>
        {review.disableAllowed ? <label className="confirmation-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t("我确认将此 Skill 移入私有停用区。", "I confirm moving this Skill to the private disabled area.")}</span></label> : <p className="blocked-notice">{t("请先处理阻断项。", "Resolve the blocking items first.")}</p>}
      </>}
      {error && <p className="inline-error">{error}</p>}
      <div className="dialog-actions"><button className="button button-quiet" type="button" onClick={onClose} disabled={working}>{t("取消", "Cancel")}</button><button className="button button-primary" type="button" onClick={() => void confirm()} disabled={!review?.disableAllowed || !confirmed || working}><PauseCircle size={15} />{working ? t("正在验证并停用…", "Verifying and disabling…") : t("确认停用", "Confirm disable")}</button></div>
    </AccessibleDialog>
  );
}
