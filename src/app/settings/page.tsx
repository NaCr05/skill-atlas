import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Check, ExternalLink, KeyRound, LockKeyhole, MapPin, ServerCog } from "lucide-react";

import { LocalizedText } from "@/components/localized-text";
import { LANGUAGE_COOKIE, normalizeLanguage, permissionLabel, sourceLabel } from "@/core/i18n";
import { resolveCodexEnvironment } from "@/core/skills/paths";

export async function generateMetadata(): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return { title: language === "zh" ? "环境与边界" : "Environment and boundaries" };
}
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const environment = resolveCodexEnvironment();
  const integrations = [
    { name: "SkillsMP", variable: "SKILLSMP_API_KEY", ready: Boolean(process.env.SKILLSMP_API_KEY), zh: "不配置也可使用匿名搜索额度", en: "Anonymous search quota works without configuration" },
    { name: "skills.sh", variable: "VERCEL_OIDC_TOKEN", ready: Boolean(process.env.VERCEL_OIDC_TOKEN), zh: "不配置时提供网页排行榜入口", en: "A web leaderboard link is available without configuration" },
    { name: "GitHub", variable: "GITHUB_TOKEN", ready: Boolean(process.env.GITHUB_TOKEN), zh: "公开仓库可匿名；Token 可提高 API 额度", en: "Public repositories work anonymously; a token raises API limits" },
    { name: "AI 提示词增强", enName: "AI Prompt enhancement", variable: "OPENAI_API_KEY + OPENAI_MODEL", ready: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), zh: "完全可选；默认模板始终可用", en: "Entirely optional; the default template is always available" },
  ];

  return (
    <main className="settings-page">
      <header className="page-intro">
        <span className="eyebrow"><LocalizedText zh="本地控制面" en="LOCAL CONTROL PLANE" /></span>
        <h1><LocalizedText zh="路径、权限与" en="Paths, permissions, and " /><em><LocalizedText zh="安全边界。" en="safety boundaries." /></em></h1>
        <p><LocalizedText zh="这里不显示任何 Key 内容，只确认集成是否就绪。配置通过本机环境变量提供。" en="No secret values are displayed here. Skill Atlas only confirms whether an integration is ready, using environment variables from this computer." /></p>
      </header>

      <section className="settings-grid">
        <article className="settings-panel settings-primary">
          <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="CODEX 主目录" en="CODEX HOME" /></span><h2><MapPin size={20} /> <LocalizedText zh="主目录检测" en="Home directory" /></h2></div><span className="ready-mark"><Check size={15} /> <LocalizedText zh="已解析" en="Resolved" /></span></div>
          <code className="settings-path">{environment.codexHome}</code>
          <p><LocalizedText zh="检测方式：" en="Detected from: " />{environment.detectedFrom === "CODEX_HOME" ? <LocalizedText zh="CODEX_HOME 环境变量" en="CODEX_HOME environment variable" /> : <LocalizedText zh="Windows 用户目录默认值" en="Windows user-directory default" />}</p>
          <div className="source-map">
            {environment.sources.map((source) => (
              <div key={`${source.kind}-${source.rootPath}`} data-permission={source.permission}>
                <span><LocalizedText zh={sourceLabel(source, "zh")} en={sourceLabel(source, "en")} /></span>
                <code>{source.rootPath}</code>
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
                <div><strong><LocalizedText zh={integration.name} en={integration.enName || integration.name} /></strong><code>{integration.variable}</code><small><LocalizedText zh={integration.zh} en={integration.en} /></small></div>
                <b>{integration.ready ? <LocalizedText zh="已就绪" en="READY" /> : <LocalizedText zh="可选" en="OPTIONAL" />}</b>
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
