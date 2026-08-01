import { ArrowLeft, ExternalLink, FileCode2, FolderOpen, GitBranch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DetailPrompt } from "@/components/detail-prompt";
import { LocalizedText } from "@/components/localized-text";
import { ProvenanceLabel } from "@/components/provenance-label";
import { StatusBadge } from "@/components/status-badge";
import { TranslationBadge } from "@/components/translation-badge";
import { environmentStatusLabel, localizeGeneratedText, permissionLabel, sourceKindLabel, sourceLabel, statusLabel, structureStatusLabel } from "@/core/i18n";
import {
  resourceKindLabel,
  translatedInstructionOverview,
  translatedRecommendations,
  translatedSkillDescription,
  translatedUseCases,
} from "@/core/skill-translations";
import { findSkillById } from "@/core/skills/discover";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({ params }: { params: Promise<{ skillId: string }> }) {
  const { skillId } = await params;
  const skill = await findSkillById(skillId);
  if (!skill) notFound();

  return (
    <main className="detail-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} /> <LocalizedText zh="返回能力清单" en="Back to Skill inventory" /></Link>
      <header className="detail-hero" data-source={skill.source.kind}>
        <span className="source-spine" aria-hidden="true" />
        <div className="detail-title">
          <div><span className="source-code"><LocalizedText zh={sourceKindLabel(skill.source.kind, "zh")} en={sourceKindLabel(skill.source.kind, "en")} /> / <LocalizedText zh={permissionLabel(skill.source.permission, "zh")} en={permissionLabel(skill.source.permission, "en")} /></span><StatusBadge status={skill.status} /></div>
          <h1>{skill.displayName}</h1>
          <code>${skill.name}</code>
          <p><LocalizedText zh={translatedSkillDescription(skill)} en={skill.description} /></p>
          {!/\p{Script=Han}/u.test(skill.description) && <TranslationBadge />}
          <ProvenanceLabel kind="source" />
        </div>
        <aside>
          <DetailPrompt skill={skill} />
          <p><LocalizedText zh="复制后返回 Codex，在新任务中粘贴并补充你的具体要求。" en="Return to Codex after copying, then paste it into a new task and add your specific requirements." /></p>
        </aside>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="content-panel">
            <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="源说明" en="SOURCE INSTRUCTIONS" /></span><h2><LocalizedText zh="调用规则" en="Invocation rules" /></h2></div><ProvenanceLabel kind="source" /></div>
            <div className="rule-strip">
              <div><span><LocalizedText zh="自动触发" en="Automatic invocation" /></span><strong>{skill.allowImplicitInvocation ? <LocalizedText zh="允许" en="Allowed" /> : <LocalizedText zh="不允许，必须点名" en="Not allowed; name it explicitly" />}</strong></div>
              <div><span><LocalizedText zh="调用状态" en="Invocation status" /></span><strong><LocalizedText zh={statusLabel(skill.status, "zh")} en={statusLabel(skill.status, "en")} /></strong></div>
              <div><span><LocalizedText zh="结构" en="Structure" /></span><strong><LocalizedText zh={structureStatusLabel(skill.structureStatus, "zh")} en={structureStatusLabel(skill.structureStatus, "en")} /></strong></div>
              <div><span><LocalizedText zh="环境" en="Environment" /></span><strong><LocalizedText zh={environmentStatusLabel(skill.environmentStatus, "zh")} en={environmentStatusLabel(skill.environmentStatus, "en")} /></strong></div>
              <div><span><LocalizedText zh="依赖" en="Dependencies" /></span><strong>{skill.dependencies.length ? skill.dependencies.join(", ") : <LocalizedText zh="无已声明技能依赖" en="No declared Skill dependencies" />}</strong></div>
            </div>
            <pre className="instruction-viewer i18n-zh" lang="zh-CN">{translatedInstructionOverview(skill)}</pre>
            <pre className="instruction-viewer i18n-en" lang="en">{skill.instructions || "SKILL.md has no instruction body."}</pre>
            <details className="source-original i18n-zh">
              <summary>查看原始 SKILL.md（原文）</summary>
              <p>以下内容来自磁盘中的原始文件，没有经过翻译或改写。</p>
              <pre>{skill.instructions || "SKILL.md 没有正文说明。"}</pre>
            </details>
          </section>

          <section className="content-panel">
            <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="场景地图" en="SCENARIO MAP" /></span><h2><LocalizedText zh="适用场景" en="Usage scenarios" /></h2></div><ProvenanceLabel kind="dashboard" /></div>
            <div className="scenario-grid">
              <div>
                <h3><LocalizedText zh="使用案例" en="Use cases" /></h3>
                <ul className="i18n-zh" lang="zh-CN">{translatedUseCases(skill).map((item) => <li key={item}>{item}</li>)}</ul>
                <ul className="i18n-en" lang="en">{skill.useCases.map((item) => <li key={item}>{localizeGeneratedText(item, "en")}</li>)}</ul>
              </div>
              <div>
                <h3><LocalizedText zh="推荐时机" en="When to use it" /></h3>
                <ul className="i18n-zh" lang="zh-CN">{translatedRecommendations(skill).map((item) => <li key={item}>{item}</li>)}</ul>
                <ul className="i18n-en" lang="en">{skill.recommendations.map((item) => <li key={item}>{localizeGeneratedText(item, "en")}</li>)}</ul>
              </div>
            </div>
          </section>

          <section className="content-panel">
            <div className="panel-heading"><div><span className="eyebrow"><LocalizedText zh="文件清单" en="FILE MANIFEST" /></span><h2><LocalizedText zh="配套文件" en="Supporting files" /></h2></div><span className="panel-count">{skill.resources.length}</span></div>
            <div className="resource-table">
              {skill.resources.map((resource) => (
                <div key={resource.path}><FileCode2 size={15} /><code>{resource.path}</code><span><LocalizedText zh={resourceKindLabel(resource.kind, "zh")} en={resourceKindLabel(resource.kind, "en")} /></span><small>{resource.size.toLocaleString()} B</small></div>
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-sidebar">
          <section className="side-panel">
            <h2><FolderOpen size={17} /> <LocalizedText zh="溯源" en="Provenance" /></h2>
            <dl>
              <div><dt><LocalizedText zh="来源" en="Source" /></dt><dd><LocalizedText zh={sourceLabel(skill.source, "zh")} en={sourceLabel(skill.source, "en")} /></dd></div>
              <div><dt><LocalizedText zh="权限" en="Permission" /></dt><dd><LocalizedText zh={permissionLabel(skill.source.permission, "zh")} en={permissionLabel(skill.source.permission, "en")} /></dd></div>
              {skill.plugin && <><div><dt><LocalizedText zh="插件" en="Plugin" /></dt><dd>{skill.plugin.name}</dd></div><div><dt><LocalizedText zh="插件版本" en="Plugin version" /></dt><dd>{skill.plugin.version}</dd></div></>}
              <div><dt><LocalizedText zh="作者" en="Author" /></dt><dd>{skill.author || <LocalizedText zh="元数据未声明" en="Not declared in metadata" />}</dd></div>
              <div><dt><LocalizedText zh="更新时间" en="Updated" /></dt><dd>{skill.modifiedAt ? <LocalizedText zh={new Date(skill.modifiedAt).toLocaleString("zh-CN")} en={new Date(skill.modifiedAt).toLocaleString("en-US")} /> : <LocalizedText zh="未知" en="Unknown" />}</dd></div>
            </dl>
            <code className="path-block">{skill.directoryPath}</code>
          </section>

          <section className="side-panel">
            <h2><GitBranch size={17} /> <LocalizedText zh="关联技能" en="Related Skills" /></h2>
            {skill.relationships.length ? <ul className="related-list">{skill.relationships.map((item) => <li key={item.id}><Link href={`/skills/${item.id}`}>{item.name}<ExternalLink size={13} /></Link><small><LocalizedText zh={item.reason} en={localizeGeneratedText(item.reason, "en")} /></small></li>)}</ul> : <p className="muted-copy"><LocalizedText zh="暂未发现高置信度关联。" en="No high-confidence relationships found yet." /></p>}
            <ProvenanceLabel kind="dashboard" />
          </section>

          <section className="side-panel">
            <h2><ShieldCheck size={17} /> <LocalizedText zh="诊断" en="Diagnostics" /></h2>
            {skill.issues.length || skill.environmentReasons.length ? <ul className="issue-list">{[...skill.issues, ...skill.environmentReasons].map((issue) => <li key={issue}><LocalizedText zh={issue} en={localizeGeneratedText(issue, "en")} /></li>)}</ul> : <p className="healthy-copy"><LocalizedText zh="结构有效，且未声明缺失依赖或外部工具。" en="Structure is valid with no declared missing dependencies or external tools." /></p>}
          </section>
        </aside>
      </div>
    </main>
  );
}
