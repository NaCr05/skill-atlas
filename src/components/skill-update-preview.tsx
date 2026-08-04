"use client";

import { AlertTriangle, Check, FileDiff, FileText, GitCompareArrows, Link2, PackageCheck, RefreshCw, Save, ShieldCheck, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AiAssistResponse } from "@/core/ai/assist-contract";
import { localizeLifecycleText } from "@/core/i18n";
import type { SkillUpdatePreview as Preview, SkillUpdateResult, UpdatePreviewStatus } from "@/core/lifecycle/types";
import type { SkillRecord } from "@/core/skills/types";
import { aiAssistErrorText, requestAiAssist } from "./ai-assist-client";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";
import { ProvenanceLabel } from "./provenance-label";

const statusLabels: Record<UpdatePreviewStatus, { zh: string; en: string }> = {
  "up-to-date": { zh: "与上游一致", en: "Up to date" },
  "update-available": { zh: "发现上游更新", en: "Upstream update found" },
  "differences-found": { zh: "发现文件差异", en: "Differences found" },
  "local-changes": { zh: "本地与上游均有变化", en: "Local and upstream changes" },
};

export function SkillUpdatePreview({ skill }: { skill: SkillRecord }) {
  const { language, t } = useLanguage();
  const router = useRouter();
  const initialSource = skill.sourceTracking.status === "tracked" ? skill.sourceTracking.sourceUrl : "";
  const [sourceUrl, setSourceUrl] = useState(initialSource);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(skill.sourceTracking.status === "tracked");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiSummary, setAiSummary] = useState<AiAssistResponse<"update-summary"> | null>(null);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [updateConfirmed, setUpdateConfirmed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<SkillUpdateResult | null>(null);
  const manageable = skill.source.kind === "personal" && skill.source.permission === "manage";

  async function inspect() {
    if (!sourceUrl.trim()) {
      setError(t("请填写精确的 GitHub Skill 目录地址。", "Enter the exact GitHub Skill directory URL."));
      return;
    }
    setChecking(true);
    setError("");
    setNotice("");
    setAiSummary(null);
    setAiError("");
    try {
      const response = await fetch("/api/updates/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ skillId: skill.id, sourceUrl: sourceUrl.trim() }),
      });
      const payload = (await response.json()) as Preview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法检查上游更新", "Unable to check upstream"));
      setPreview(payload);
      setUpdateConfirmed(false);
      setUpdateResult(null);
    } catch (inspectionError) {
      setPreview(null);
      setError(inspectionError instanceof Error ? inspectionError.message : t("无法检查上游更新", "Unable to check upstream"));
    } finally {
      setChecking(false);
    }
  }

  async function summarizeWithAi() {
    if (!preview) return;
    setAiWorking(true);
    setAiError("");
    try {
      setAiSummary(await requestAiAssist({
        action: "update-summary",
        language,
        preview: {
          skillName: preview.skillName,
          status: preview.status,
          localDiverged: preview.localDiverged,
          repository: preview.source.repository,
          ref: preview.source.ref,
          revision: preview.source.revision,
          summary: preview.summary,
          changes: preview.changes.slice(0, 120).map(({ path, kind, localSize, upstreamSize }) => ({ path, kind, localSize, upstreamSize })),
          changesTruncated: preview.changes.length > 120,
          risks: preview.risks.slice(0, 40).map(({ level, title, detail }) => ({ level, title, detail })),
        },
      }));
    } catch (assistError) {
      setAiError(aiAssistErrorText(assistError, language));
    } finally {
      setAiWorking(false);
    }
  }

  async function saveTracking() {
    if (!preview?.trackingAvailable) return;
    setTracking(true);
    setError("");
    try {
      const response = await fetch("/api/updates/track", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ previewId: preview.previewId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法保存来源关联", "Unable to save source tracking"));
      setTracked(true);
      setPreview({ ...preview, trackingAvailable: false });
      setNotice(t("来源关联已保存在 Skill Atlas 本地注册表中，不会改写 SKILL.md。", "Source tracking was saved in Skill Atlas's local registry; SKILL.md was not changed."));
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : t("无法保存来源关联", "Unable to save source tracking"));
    } finally {
      setTracking(false);
    }
  }

  async function applyUpdate() {
    if (!preview?.updateAllowed || !updateConfirmed) return;
    setUpdating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/updates/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ previewId: preview.previewId }),
      });
      const payload = (await response.json()) as SkillUpdateResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("安全更新失败", "Safe update failed"));
      setUpdateResult(payload);
      setPreview(null);
      setUpdateConfirmed(false);
      setNotice(t(
        `已更新到上游修订 ${payload.revision.slice(0, 12)}；旧版本完整保存在备份目录。`,
        `Updated to upstream revision ${payload.revision.slice(0, 12)}; the complete previous version remains in the backup directory.`,
      ));
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("安全更新失败", "Safe update failed"));
    } finally {
      setUpdating(false);
    }
  }

  const changedFiles = preview?.changes.filter((change) => change.kind !== "unchanged") || [];
  const statusLabel = preview ? statusLabels[preview.status][language] : "";

  return (
    <section className="content-panel update-preview-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIFECYCLE / UPDATE AWARENESS</span>
          <h2><GitCompareArrows size={19} /> {t("上游更新与安全替换", "Upstream update and safe replacement")}</h2>
        </div>
        <span className="preview-only-badge"><ShieldCheck size={14} /> {t("备份后原子替换", "BACKUP + ATOMIC REPLACE")}</span>
      </div>

      {!manageable ? (
        <p className="lifecycle-boundary"><AlertTriangle size={16} /> {t("此 Skill 来自只读来源。Skill Atlas 只允许为个人 Skills 建立生命周期管理。", "This Skill is read-only. Lifecycle management is limited to personal Skills.")}</p>
      ) : (
        <>
          <div className="fingerprint-strip">
            <div><span>{t("本地指纹", "Local fingerprint")}</span><code>{skill.fingerprint.value.slice(0, 16)}</code></div>
            <div><span>{t("指纹范围", "Fingerprint scope")}</span><strong>{skill.fingerprint.fileCount} {t("个文件", "files")} · {skill.fingerprint.totalBytes.toLocaleString()} B</strong></div>
            <div data-tracked={tracked}><span>{t("来源追踪", "Source tracking")}</span><strong>{tracked ? t("已记录", "Tracked") : t("未记录", "Untracked")}</strong></div>
          </div>

          <div className="source-tracking-form">
            <label>
              <span><Link2 size={14} /> {t("精确 GitHub Skill 目录", "Exact GitHub Skill directory")}</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://github.com/owner/repo/tree/main/path/to/skill"
                readOnly={tracked}
              />
            </label>
            <button className="button button-primary" type="button" onClick={() => void inspect()} disabled={checking || !sourceUrl.trim()}>
              <RefreshCw size={15} className={checking ? "is-spinning" : undefined} />
              {checking ? t("正在比较…", "Comparing…") : t("检查上游更新", "Check upstream")}
            </button>
          </div>
          <p className="update-safety-note">{t("检查阶段只读取摘要；确认更新后先完整暂存并验指纹，再备份旧版本和原子替换。任何脚本都不会执行。", "Inspection reads digests only. Confirmation fully stages and fingerprints the source before backing up and atomically replacing the old version. Scripts are never executed.")}</p>
        </>
      )}

      {error && <p className="inline-error standalone">{error}</p>}
      {notice && <p className="inline-notice"><Check size={15} /> {notice}</p>}

      {preview && (
        <div className="update-preview-result" data-status={preview.status}>
          <div className="update-version-summary">
            <div>
              <span>{t("比较结果", "Comparison")}</span>
              <strong>{statusLabel}</strong>
              <small>{preview.source.repository}@{preview.source.ref}</small>
            </div>
            <div><span>{t("上游修订", "Upstream revision")}</span><code>{preview.source.revision.slice(0, 12)}</code></div>
            <div><span>{t("上游指纹", "Upstream fingerprint")}</span><code>{preview.upstream.value.slice(0, 16)}</code></div>
          </div>

          <div className="change-metrics" aria-label={t("文件差异统计", "File difference summary")}>
            <div data-kind="added"><strong>+{preview.summary.added}</strong><span>{t("新增", "Added")}</span></div>
            <div data-kind="modified"><strong>~{preview.summary.modified}</strong><span>{t("修改", "Modified")}</span></div>
            <div data-kind="removed"><strong>-{preview.summary.removed}</strong><span>{t("删除", "Removed")}</span></div>
            <div data-kind="unchanged"><strong>{preview.summary.unchanged}</strong><span>{t("未变化", "Unchanged")}</span></div>
          </div>

          {changedFiles.length ? (
            <div className="update-file-diff">
              <div className="subsection-heading"><h3><FileDiff size={16} /> {t("逐文件差异", "File-by-file differences")}</h3><span>{changedFiles.length}</span></div>
              {changedFiles.map((change) => (
                <div key={`${change.kind}-${change.path}`} data-kind={change.kind}>
                  <b>{change.kind === "added" ? "+" : change.kind === "modified" ? "~" : "−"}</b>
                  <BreakablePath value={change.path} />
                  <span>{change.localSize === undefined ? "—" : `${change.localSize.toLocaleString()} B`} → {change.upstreamSize === undefined ? "—" : `${change.upstreamSize.toLocaleString()} B`}</span>
                </div>
              ))}
            </div>
          ) : <p className="healthy-copy">{t("本地文件与上游文件树完全一致。", "Local files exactly match the upstream tree.")}</p>}

          <div className="update-risk-list">
            {preview.risks.map((risk) => (
              <article key={risk.code} data-level={risk.level}>
                {risk.level === "info" ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
                <div><strong>{localizeLifecycleText(risk.title, language)}</strong><p>{localizeLifecycleText(risk.detail, language)}</p></div>
              </article>
            ))}
          </div>

          <div className="ai-entry-panel update-ai-entry">
            <div>
              <strong><FileText size={16} /> {t("把文件差异整理成影响摘要", "Turn file differences into an impact summary")}</strong>
              <small>{t("只有点击后才调用外部 AI；不会下载、覆盖或更新任何文件。", "External AI is called only after the click; no files are downloaded, overwritten, or updated.")}</small>
            </div>
            <button className="button button-ai" type="button" disabled={aiWorking} onClick={() => void summarizeWithAi()}><WandSparkles size={15} /> {aiWorking ? t("AI 总结中…", "AI summarizing…") : t("让 AI 总结差异", "Summarize with AI")}</button>
          </div>

          {aiError && <p className="ai-inline-error compact">{aiError}</p>}
          {aiSummary && (
            <article className="ai-advisory-card ai-update-summary" data-impact={aiSummary.result.impact}>
              <header><span><WandSparkles size={16} /> {t("AI 更新摘要", "AI update summary")}</span><small>{aiSummary.provider === "deepseek" ? "DeepSeek" : "OpenAI"} · {t("仅供决策参考", "Decision support only")}</small></header>
              <div className="ai-verdict-row"><strong>{aiSummary.result.impact === "low" ? t("低影响", "Low impact") : aiSummary.result.impact === "medium" ? t("中等影响", "Medium impact") : t("高影响", "High impact")}</strong><span>{aiSummary.result.summary}</span></div>
              <div className="ai-review-lists">
                <div><h4>{t("主要变化", "Key changes")}</h4><ul>{aiSummary.result.changes.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h4>{t("更新前检查", "Before updating")}</h4><ul>{aiSummary.result.watchItems.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <p className="ai-recommendation">{t("AI 建议：", "AI recommendation: ")}<strong>{aiSummary.result.recommendation === "update" ? t("可以更新", "Update") : aiSummary.result.recommendation === "review" ? t("先人工复核", "Review first") : t("暂时跳过", "Skip for now")}</strong></p>
            </article>
          )}

          {preview.trackingAvailable && (
            <div className="tracking-confirmation">
              <div><strong>{t("确认这是正确的上游来源？", "Is this the correct upstream source?")}</strong><p>{t("保存后可直接检查后续变化；只写入 Skill Atlas 注册表。", "Save it for one-click future checks. Only the Skill Atlas registry is changed.")}</p></div>
              <button className="button button-quiet" type="button" disabled={tracking} onClick={() => void saveTracking()}><Save size={15} /> {tracking ? t("正在保存…", "Saving…") : t("保存来源关联", "Save source tracking")}</button>
            </div>
          )}

          {preview.updateAllowed && (
            <div className="tracking-confirmation update-confirmation">
              <label className="confirmation-row">
                <input type="checkbox" checked={updateConfirmed} onChange={(event) => setUpdateConfirmed(event.target.checked)} />
                <span>{t(
                  "我已检查文件差异和风险，同意先备份当前完整目录，再安装已验证的上游版本。",
                  "I reviewed the file differences and risks and approve backing up the complete current directory before installing the verified upstream version.",
                )}</span>
              </label>
              <button className="button button-primary" type="button" disabled={!updateConfirmed || updating} onClick={() => void applyUpdate()}>
                <PackageCheck size={15} /> {updating ? t("正在暂存、验证并更新…", "Staging, verifying, and updating…") : t("确认安全更新", "Confirm safe update")}
              </button>
            </div>
          )}
        </div>
      )}

      {updateResult && (
        <div className="update-version-summary" data-testid="update-success">
          <div><span>{t("更新事务", "Update transaction")}</span><code>{updateResult.transactionId.slice(0, 12)}</code></div>
          <div><span>{t("已安装指纹", "Installed fingerprint")}</span><code>{updateResult.installedFingerprint.value.slice(0, 16)}</code></div>
          <div><span>{t("旧版本备份", "Previous-version backup")}</span><BreakablePath value={updateResult.backupDirectory} /></div>
        </div>
      )}

      <ProvenanceLabel kind="dashboard" />
    </section>
  );
}
