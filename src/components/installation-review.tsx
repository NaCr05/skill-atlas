"use client";

import { AlertTriangle, Check, FileCode2, ShieldCheck, WandSparkles, X } from "lucide-react";
import { useState } from "react";

import type { AiAssistResponse } from "@/core/ai/assist-contract";
import { localeFor, localizeInstallerText } from "@/core/i18n";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import { aiAssistErrorText, requestAiAssist } from "./ai-assist-client";
import { AccessibleDialog } from "./accessible-dialog";
import { BreakablePath } from "./breakable-path";
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
  const [aiReview, setAiReview] = useState<AiAssistResponse<"installation-explanation"> | null>(null);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiError, setAiError] = useState("");

  async function explainWithAi() {
    setAiWorking(true);
    setAiError("");
    try {
      setAiReview(await requestAiAssist({
        action: "installation-explanation",
        language,
        review: {
          skillName: review.skillName,
          description: review.description,
          repository: review.repository,
          ref: review.ref,
          sourceDirectory: review.sourceDirectory,
          installAllowed: review.installAllowed,
          fileCount: review.files.length,
          totalBytes: review.totalBytes,
          files: review.files.slice(0, 120),
          filesTruncated: review.files.length > 120,
          risks: review.risks.slice(0, 40),
        },
      }));
    } catch (assistError) {
      setAiError(aiAssistErrorText(assistError, language));
    } finally {
      setAiWorking(false);
    }
  }

  async function install() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/install/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
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
    <AccessibleDialog
      className="installation-dialog"
      labelledBy="install-review-title"
      onClose={onClose}
      closeDisabled={working}
      busy={working}
    >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("安装检查点", "INSTALLATION CHECKPOINT")}</span>
            <h2 id="install-review-title">{t("安装前审查", "Pre-installation review")} · {review.skillName}</h2>
          </div>
          <button className="icon-button" type="button" disabled={working} onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={20} />
          </button>
        </div>

        <div className="review-route">
          <div>
            <span>{t("来源", "Source")}</span>
            <strong>{review.repository}@{review.ref}</strong>
            <BreakablePath value={review.sourceDirectory} />
            <small>{t("修订", "Revision")}: {review.revision.slice(0, 12)} · {t("指纹", "Fingerprint")}: {review.fingerprint.value.slice(0, 12)}</small>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span>{t("唯一目标", "Single target")}</span>
            <strong>{review.skillName}</strong>
            <BreakablePath value={review.targetDirectory} />
          </div>
        </div>

        {review.sourceTrust && (
          <section className="source-trust-panel" aria-label={t("安装来源可信度", "Installation source trust") }>
            <header><div><ShieldCheck size={17} /><strong>{t("来源可信度证据", "Source trust evidence")}</strong></div><span data-activity={review.sourceTrust.activity}>{review.sourceTrust.activity === "active" ? t("近期活跃", "Recently active") : review.sourceTrust.activity === "quiet" ? t("低频维护", "Low activity") : review.sourceTrust.activity === "stale" ? t("长期未活跃", "Stale") : t("活跃度未知", "Unknown activity")}</span></header>
            <div className="source-trust-grid">
              <div><span>{t("仓库作者", "Repository owner")}</span><strong>{review.sourceTrust.repositoryOwner}{review.sourceTrust.ownerType ? ` · ${review.sourceTrust.ownerType}` : ""}</strong></div>
              <div><span>{t("最近提交", "Latest commit")}</span><strong>{review.sourceTrust.latestCommitAt ? new Date(review.sourceTrust.latestCommitAt).toLocaleDateString(localeFor(language)) : t("未获取", "Unavailable")}</strong><small>{review.sourceTrust.latestCommitAuthor || "—"}</small></div>
              <div><span>{t("许可证", "License")}</span><strong>{review.sourceTrust.licenseSpdx || t("未识别", "Not detected")}</strong></div>
              <div><span>{t("仓库指标", "Repository signals")}</span><strong>★ {review.sourceTrust.stars?.toLocaleString(localeFor(language)) ?? "—"} · {t("问题", "issues")} {review.sourceTrust.openIssues?.toLocaleString(localeFor(language)) ?? "—"}</strong></div>
            </div>
            <div className="source-version-summary"><span>{t("版本摘要", "Version summary")}</span><strong>{review.sourceTrust.versionSummary}</strong>{review.sourceTrust.latestCommitMessage && <small>{review.sourceTrust.latestCommitMessage}</small>}</div>
            <div className="source-lock"><ShieldCheck size={15} /><div><strong>{t("来源已锁定", "Source locked")}</strong><p>{t("确认安装时只接受本次审查的仓库、ref、Git tree 修订和完整文件指纹；分支之后发生变化不会改变这张审查单。", "Confirmation accepts only the repository, ref, Git tree revision, and complete fingerprint reviewed here. Later branch movement cannot change this review.")}</p><code>{review.sourceTrust.lock.repository}@{review.sourceTrust.lock.ref} · {review.sourceTrust.lock.revision.slice(0, 12)} · {review.sourceTrust.lock.fingerprint.slice(0, 12)}</code></div></div>
          </section>
        )}

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
                <div key={file.path}><BreakablePath value={file.path} /><span>{file.size.toLocaleString(localeFor(language))} B</span></div>
              ))}
            </div>
            <p className="file-total">{review.files.length} {t("个文件", "files")} · {review.totalBytes.toLocaleString(localeFor(language))} B</p>
          </div>
        </div>

        <div className="ai-entry-panel">
          <div>
            <strong><WandSparkles size={16} /> {t("需要更容易理解的安装解读？", "Want a plain-language installation review?")}</strong>
            <small>{t("只有点击后才调用外部 AI；AI 建议不能解除上方的阻断风险。", "External AI is called only after the click and cannot override blocking risks above.")}</small>
          </div>
          <button className="button button-ai" type="button" disabled={aiWorking} onClick={() => void explainWithAi()}>
            <WandSparkles size={15} /> {aiWorking ? t("AI 解读中…", "AI reviewing…") : t("让 AI 解读审查单", "Explain with AI")}
          </button>
        </div>

        {aiError && <p className="ai-inline-error compact">{aiError}</p>}
        {aiReview && (
          <article className="ai-advisory-card ai-install-review" data-verdict={aiReview.result.verdict}>
            <header><span><WandSparkles size={16} /> {t("AI 安装建议", "AI installation advice")}</span><small>{aiReview.provider === "deepseek" ? "DeepSeek" : "OpenAI"} · {t("仅供参考", "Advisory only")}</small></header>
            <div className="ai-verdict-row"><strong>{aiReview.result.verdict === "safe-to-consider" ? t("可考虑安装", "Safe to consider") : aiReview.result.verdict === "review-carefully" ? t("建议仔细复核", "Review carefully") : t("不建议安装", "Do not install")}</strong><span>{aiReview.result.summary}</span></div>
            <div className="ai-review-lists">
              <div><h4>{t("值得关注的优点", "Strengths")}</h4><ul>{aiReview.result.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><h4>{t("风险与疑问", "Watch items and questions")}</h4><ul>{[...aiReview.result.watchItems, ...aiReview.result.questions].map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
          </article>
        )}

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
          <button className="button button-quiet" type="button" disabled={working} onClick={onClose}>{t("取消", "Cancel")}</button>
          <button
            className="button button-primary"
            disabled={!review.installAllowed || !confirmed || working}
            onClick={install}
          >
            {working ? t("验证并安装中…", "Verifying and installing…") : t("确认并安装完整目录", "Confirm and install complete directory")}
          </button>
        </div>
    </AccessibleDialog>
  );
}
