"use client";

import { AlertTriangle, Check, FileCode2, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { localeFor, localizeInstallerText } from "@/core/i18n";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import { useLanguage } from "./language-provider";

export function InstallationReview({
  review,
  onClose,
  onInstalled,
}: {
  review: Review;
  onClose: () => void;
  onInstalled: (result: InstallationResult) => void;
}) {
  const { language, t } = useLanguage();
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function install() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/install/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: review.planId }),
      });
      const payload = (await response.json()) as InstallationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("安装失败", "Installation failed"));
      onInstalled(payload);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : t("安装失败", "Installation failed"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="installation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("安装检查点", "INSTALLATION CHECKPOINT")}</span>
            <h2 id="install-review-title">{t("安装前审查", "Pre-installation review")} · {review.skillName}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={20} />
          </button>
        </div>

        <div className="review-route">
          <div>
            <span>{t("来源", "Source")}</span>
            <strong>{review.repository}@{review.ref}</strong>
            <small>{review.sourceDirectory}</small>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span>{t("唯一目标", "Single target")}</span>
            <strong>{review.skillName}</strong>
            <small>{review.targetDirectory}</small>
          </div>
        </div>

        <div className="review-columns">
          <div>
            <h3><ShieldCheck size={17} /> {t("风险说明", "Risk review")}</h3>
            <div className="risk-list">
              {review.risks.map((risk) => (
                <article key={`${risk.title}-${risk.detail}`} data-level={risk.level}>
                  {risk.level === "blocked" ? <AlertTriangle size={17} /> : <Check size={17} />}
                  <div><strong>{localizeInstallerText(risk.title, language)}</strong><p>{localizeInstallerText(risk.detail, language)}</p></div>
                </article>
              ))}
            </div>
          </div>
          <div>
            <h3><FileCode2 size={17} /> {t("完整文件树", "Complete file tree")}</h3>
            <div className="file-list">
              {review.files.map((file) => (
                <div key={file.path}><code>{file.path}</code><span>{file.size.toLocaleString(localeFor(language))} B</span></div>
              ))}
            </div>
            <p className="file-total">{review.files.length} {t("个文件", "files")} · {review.totalBytes.toLocaleString(localeFor(language))} B</p>
          </div>
        </div>

        {review.installAllowed ? (
          <label className="confirmation-row">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>{t("我已阅读来源、完整文件列表和风险说明；确认只安装到上述个人技能目录。", "I have reviewed the source, complete file list, and risks, and confirm installation only to the personal Skills directory shown above.")}</span>
          </label>
        ) : (
          <p className="blocked-notice">{t("存在阻断风险，本次安装不能继续。", "Blocking risks prevent this installation from continuing.")}</p>
        )}
        {error && <p className="inline-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button button-quiet" onClick={onClose}>{t("取消", "Cancel")}</button>
          <button
            className="button button-primary"
            disabled={!review.installAllowed || !confirmed || working}
            onClick={install}
          >
            {working ? t("验证并安装中…", "Verifying and installing…") : t("确认安装完整目录", "Install complete directory")}
          </button>
        </div>
      </section>
    </div>
  );
}
