import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Activity, AlertTriangle, Check, CircleCheckBig, ExternalLink, KeyRound, LockKeyhole, MapPin, ServerCog, Terminal } from "lucide-react";

import { AiProviderSettings } from "@/components/ai-provider-settings";
import { BreakablePath } from "@/components/breakable-path";
import { SourcePolicySettings } from "@/components/source-policy-settings";
import { DataPortabilityPanel } from "@/components/data-portability-panel";
import { WindowsDistributionPanel } from "@/components/windows-distribution-panel";
import { LocalizedText } from "@/components/localized-text";
import { aiProviderLabel } from "@/core/ai/provider-config";
import { loadRuntimeAiSettings } from "@/core/ai/runtime-config";
import { inspectRuntimeEnvironment } from "@/core/environment/diagnostics";
import { LANGUAGE_COOKIE, normalizeLanguage, permissionLabel, sourceLabel } from "@/core/i18n";
import { resolveCodexEnvironment } from "@/core/skills/paths";
import { loadSourcePolicy } from "@/core/source-policy/source-policy";

export async function generateMetadata(): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: language === "zh" ? "环境与边界" : "Environment and boundaries" };
}
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const environment = resolveCodexEnvironment();
  const diagnostics = await inspectRuntimeEnvironment();
  const checkedAt = diagnostics.checkedAt.replace("T", " ").slice(0, 19);
  const { config: aiConfig, summary: aiSummary } = await loadRuntimeAiSettings();
  const sourcePolicy = await loadSourcePolicy();
  const currentProvider = aiProviderLabel(aiConfig.provider);
  const configuredProviders = aiConfig.configuredProviders.map(aiProviderLabel).join("、") || "无";
  const aiVariable = aiConfig.provider === "openai"
    ? `${aiSummary.hasSavedSettings ? "Windows DPAPI" : "ENV"} · OpenAI`
    : aiConfig.provider === "deepseek"
      ? `${aiSummary.hasSavedSettings ? "Windows DPAPI" : "ENV"} · DeepSeek`
      : "页面配置 / AI_PROVIDER";
  const aiVariableEn = aiConfig.provider
    ? aiVariable
    : "Page settings / AI_PROVIDER";
  const aiDescription = aiConfig.selection === "invalid"
    ? {
        zh: `AI_PROVIDER=${aiConfig.requestedValue} 无效；应为 auto、openai 或 deepseek`,
        en: `AI_PROVIDER=${aiConfig.requestedValue} is invalid; use auto, openai, or deepseek`,
      }
    : aiConfig.provider
      ? aiConfig.configured
        ? {
            zh: `当前提供商：${currentProvider}${aiConfig.selection === "auto" ? "（自动选择）" : ""}；模型：${aiConfig.model}；已配置：${configuredProviders}`,
            en: `Current provider: ${currentProvider}${aiConfig.selection === "auto" ? " (auto-selected)" : ""}; model: ${aiConfig.model}; configured: ${aiConfig.configuredProviders.map(aiProviderLabel).join(", ")}`,
          }
        : {
            zh: `当前选择：${currentProvider}；缺少 ${aiConfig.missingVariables.join("、")}；默认模板仍可用`,
            en: `Selected: ${currentProvider}; missing ${aiConfig.missingVariables.join(", ")}; the default template remains available`,
          }
      : {
          zh: "当前提供商：未配置；默认模板始终可用",
          en: "Current provider: not configured; the default template is always available",
        };
  const integrations = [
    { name: "SkillsMP", variable: "SKILLSMP_API_KEY", ready: Boolean(process.env.SKILLSMP_API_KEY), zh: "不配置也可使用匿名搜索额度", en: "Anonymous search quota works without configuration" },
    { name: "skills.sh", variable: "VERCEL_OIDC_TOKEN", ready: Boolean(process.env.VERCEL_OIDC_TOKEN), zh: "不配置时提供网页排行榜入口", en: "A web leaderboard link is available without configuration" },
    { name: "GitHub", variable: "GITHUB_TOKEN", ready: Boolean(process.env.GITHUB_TOKEN), zh: "公开仓库可匿名；Token 可提高 API 额度", en: "Public repositories work anonymously; a token raises API limits" },
    {
      name: `AI 提示词增强 · ${currentProvider === "None" ? "未配置" : currentProvider}`,
      enName: `AI Prompt enhancement · ${currentProvider === "None" ? "Not configured" : currentProvider}`,
      variable: aiVariable,
      enVariable: aiVariableEn,
      ready: aiConfig.configured,
      zh: aiDescription.zh,
      en: aiDescription.en,
      statusZh: aiConfig.configured ? "已就绪" : aiConfig.provider || aiConfig.selection === "invalid" ? "需配置" : "可选",
      statusEn: aiConfig.configured ? "READY" : aiConfig.provider || aiConfig.selection === "invalid" ? "ACTION" : "OPTIONAL",
    },
  ];

  return (
    <main className="settings-page">
      <header className="page-intro">
        <span className="eyebrow"><LocalizedText zh="本地控制面" en="LOCAL CONTROL PLANE" /></span>
        <h1><LocalizedText zh="路径、权限与" en="Paths, permissions, and " /><em><LocalizedText zh="安全边界。" en="safety boundaries." /></em></h1>
        <p><LocalizedText zh="这里不显示任何 Key 内容。你可以在页面中加密保存 AI 连接，也可以继续使用本机环境变量。" en="No secret values are displayed here. Save an encrypted AI connection in the page or keep using environment variables from this computer." /></p>
      </header>

      <section className="environment-health" data-status={diagnostics.overall}>
        <div className="health-heading">
          <div>
            <span className="eyebrow"><LocalizedText zh="启动就绪度" en="STARTUP READINESS" /></span>
            <h2><Activity size={21} /> <LocalizedText zh="环境体检" en="Environment health check" /></h2>
            <p><LocalizedText zh="区分源码结构、运行环境和 Skills 目录权限；这里只做只读检测，不会自动改动你的电脑。" en="Checks source structure, runtime readiness, and Skills directory access. This diagnostic is read-only and does not change your computer." /></p>
          </div>
          <div className="health-summary" data-status={diagnostics.overall}>
            {diagnostics.overall === "ready" ? <CircleCheckBig size={22} /> : <AlertTriangle size={22} />}
            <strong>{diagnostics.readyCount}/{diagnostics.checks.length}</strong>
            <span>{diagnostics.overall === "ready" ? <LocalizedText zh="全部就绪" en="All ready" /> : <LocalizedText zh={`${diagnostics.actionCount} 项需要处理`} en={`${diagnostics.actionCount} need action`} />}</span>
          </div>
        </div>

        <div className="health-check-grid">
          {diagnostics.checks.map((check) => (
            <article key={check.id} data-status={check.status}>
              <span className="health-status-icon">{check.status === "ready" ? <Check size={16} /> : <AlertTriangle size={16} />}</span>
              <div>
                <div className="health-check-title">
                  <strong><LocalizedText zh={check.label.zh} en={check.label.en} /></strong>
                  <b>{check.status === "ready" ? <LocalizedText zh="可用" en="READY" /> : <LocalizedText zh="需配置" en="ACTION" />}</b>
                </div>
                <p><LocalizedText zh={check.detail.zh} en={check.detail.en} /></p>
                {check.repair ? (
                  <div className="repair-commands">
                    <div><span>CMD</span><code>{check.repair.cmd}</code></div>
                    <div><span>PS</span><code>{check.repair.powershell}</code></div>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <footer className="health-footer">
          <span><Terminal size={14} /> <LocalizedText zh="启动前完整检查" en="Full preflight check" /></span>
          <code>start-skill-atlas.cmd --check</code>
          <small><LocalizedText zh={`页面检测时间：${checkedAt}`} en={`Checked at: ${checkedAt}`} /></small>
        </footer>
      </section>

      <AiProviderSettings initialSummary={aiSummary} />
      <SourcePolicySettings initialPolicy={sourcePolicy} />
      <DataPortabilityPanel />
      <WindowsDistributionPanel />

      <section className="settings-grid">
        <article className="settings-panel settings-primary">
          <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="CODEX 主目录" en="CODEX HOME" /></span><h2><MapPin size={20} /> <LocalizedText zh="主目录检测" en="Home directory" /></h2></div><span className="ready-mark"><Check size={15} /> <LocalizedText zh="已解析" en="Resolved" /></span></div>
          <BreakablePath className="settings-path" value={environment.codexHome} />
          <p><LocalizedText zh="检测方式：" en="Detected from: " />{environment.detectedFrom === "CODEX_HOME" ? <LocalizedText zh="CODEX_HOME 环境变量" en="CODEX_HOME environment variable" /> : <LocalizedText zh="Windows 用户目录默认值" en="Windows user-directory default" />}</p>
          <div className="source-map">
            {environment.sources.map((source) => (
              <div key={`${source.kind}-${source.rootPath}`} data-permission={source.permission}>
                <span><LocalizedText zh={sourceLabel(source, "zh")} en={sourceLabel(source, "en")} /></span>
                <BreakablePath value={source.rootPath} />
                <strong><LocalizedText zh={permissionLabel(source.permission, "zh")} en={permissionLabel(source.permission, "en")} /></strong>
              </div>
            ))}
          </div>
        </article>

        <article className="settings-panel">
          <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="可选适配器" en="OPTIONAL ADAPTERS" /></span><h2><KeyRound size={20} /> <LocalizedText zh="外部集成" en="External integrations" /></h2></div></div>
          <div className="integration-list">
            {integrations.map((integration) => (
              <div key={integration.name} data-ready={integration.ready}>
                <span>{integration.ready ? <Check size={15} /> : <ServerCog size={15} />}</span>
                <div><strong><LocalizedText zh={integration.name} en={integration.enName || integration.name} /></strong><code><LocalizedText zh={integration.variable} en={integration.enVariable || integration.variable} /></code><small><LocalizedText zh={integration.zh} en={integration.en} /></small></div>
                <b><LocalizedText zh={integration.statusZh || (integration.ready ? "已就绪" : "可选")} en={integration.statusEn || (integration.ready ? "READY" : "OPTIONAL")} /></b>
              </div>
            ))}
          </div>
        </article>

        <article className="settings-panel settings-security">
          <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="安全护栏" en="GUARDRAILS" /></span><h2><LockKeyhole size={20} /> <LocalizedText zh="MVP 安全约束" en="MVP safety guardrails" /></h2></div></div>
          <ul>
            <li><LocalizedText zh={<>服务脚本只绑定 <code>127.0.0.1</code>。</>} en={<>The server binds only to <code>127.0.0.1</code>.</>} /></li>
            <li><LocalizedText zh="所有变更接口拒绝非 localhost 的 Host 与 Origin。" en="Every mutation endpoint rejects non-localhost Host and Origin values." /></li>
            <li><LocalizedText zh={<>新技能只写入解析后的 <code>CODEX_HOME/skills</code>。</>} en={<>New Skills are written only to the resolved <code>CODEX_HOME/skills</code> directory.</>} /></li>
            <li><LocalizedText zh="目标存在即停止，不覆盖、不更新、不永久删除。" en="Installation stops when a target already exists: no overwrite, update, or permanent deletion." /></li>
            <li><LocalizedText zh="GitHub 文件树先审查；路径穿越、链接、子模块和超限目录会被阻断。" en="GitHub trees are reviewed first; path traversal, links, submodules, and oversized directories are blocked." /></li>
            <li><LocalizedText zh="安装只复制文件，不执行新技能附带的脚本。" en="Installation copies files only and never runs scripts bundled with a new Skill." /></li>
          </ul>
          <a href="https://developers.openai.com/codex/skills" target="_blank" rel="noreferrer"><LocalizedText zh="Codex 技能文档" en="Codex Skills documentation" /> <ExternalLink size={14} /></a>
        </article>
      </section>
    </main>
  );
}
