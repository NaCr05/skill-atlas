"use client";

import { ArrowUpRight, CheckCircle2, Download, Search, Trophy } from "lucide-react";
import { FormEvent, useState } from "react";

import { localeFor, localizeGeneratedText, localizeMarketplaceNotice } from "@/core/i18n";
import { translatedMarketplaceDescription } from "@/core/skill-translations";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import type { MarketplaceResponse, MarketplaceSkill } from "@/core/marketplaces/adapter";
import { InstallationReview } from "./installation-review";
import { useLanguage } from "./language-provider";
import { ProvenanceLabel } from "./provenance-label";
import { TranslationBadge } from "./translation-badge";

export function MarketplaceClient() {
  const { language, t } = useLanguage();
  const [provider, setProvider] = useState<"skillsmp" | "skills-sh">("skillsmp");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [skillName, setSkillName] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [installingReview, setInstallingReview] = useState(false);
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState<InstallationResult | null>(null);

  async function loadLeaderboard() {
    setLoading(true);
    setError("");
    try {
      const result = await fetch("/api/marketplace/skills-sh?view=trending");
      setResponse((await result.json()) as MarketplaceResponse);
    } catch {
      setError(t("排行榜载入失败，可使用网页入口。", "The leaderboard could not be loaded; use the web link instead."));
    } finally {
      setLoading(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (provider !== "skillsmp" || query.trim().length < 1) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`/api/marketplace/skillsmp?q=${encodeURIComponent(query.trim())}`);
      setResponse((await result.json()) as MarketplaceResponse);
    } catch {
      setError(t("市场搜索失败；本地技能管理不受影响。", "Marketplace search failed; local Skill management is unaffected."));
    } finally {
      setLoading(false);
    }
  }

  function selectForReview(skill: MarketplaceSkill) {
    if (!skill.sourceUrl) return;
    setSourceUrl(skill.sourceUrl);
    setSkillName(skill.name);
    void inspect(skill.sourceUrl, skill.name);
  }

  async function inspect(url = sourceUrl, name = skillName) {
    if (!url.trim()) {
      setError(t("请填写 GitHub 仓库或精确技能目录地址。", "Enter a GitHub repository or an exact Skill directory URL."));
      return;
    }
    setInstallingReview(true);
    setError("");
    setInstalled(null);
    try {
      const result = await fetch("/api/install/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: url.trim(), skillName: name.trim() || undefined }),
      });
      const payload = (await result.json()) as Review & { error?: string };
      if (!result.ok) throw new Error(payload.error || t("无法审查安装源", "Unable to review the installation source"));
      setReview(payload);
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : t("无法审查安装源", "Unable to review the installation source"));
    } finally {
      setInstallingReview(false);
    }
  }

  return (
    <>
      <section className="market-switcher" aria-label={t("市场来源", "Marketplace sources")}>
        <button data-active={provider === "skillsmp"} onClick={() => { setProvider("skillsmp"); setResponse(null); }}>
          <Search size={18} />
          <span><strong>{t("SkillsMP 搜索", "Search SkillsMP")}</strong><small>{t("按名称与描述发现社区技能", "Discover community Skills by name and description")}</small></span>
        </button>
        <button data-active={provider === "skills-sh"} onClick={() => { setProvider("skills-sh"); void loadLeaderboard(); }}>
          <Trophy size={18} />
          <span><strong>{t("skills.sh 排行榜", "skills.sh leaderboard")}</strong><small>{t("查看热门与趋势安装", "Browse popular and trending installations")}</small></span>
        </button>
      </section>

      {provider === "skillsmp" && (
        <form className="market-search" onSubmit={search}>
          <Search size={20} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("例如：前端设计、论文写作、测试", "For example: frontend design, paper writing, testing")} />
          <button className="button button-primary" disabled={loading}>{loading ? t("搜索中…", "Searching…") : t("搜索市场", "Search marketplace")}</button>
        </form>
      )}

      {response?.notice && (
        <div className="market-notice">
          <p>{localizeMarketplaceNotice(response.notice, language)}</p>
          <a href={response.browseUrl} target="_blank" rel="noreferrer">{t("打开", "Open")} {response.provider} <ArrowUpRight size={15} /></a>
        </div>
      )}
      {error && <p className="inline-error standalone">{error}</p>}

      {response?.results.length ? (
        <section className="market-results">
          {response.results.map((skill, index) => (
            <article key={skill.id} className="market-card">
              <div className="rank-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="market-card-copy">
                <div><h2>{skill.name}</h2><ProvenanceLabel kind="marketplace" /></div>
                <p>{language === "zh" ? translatedMarketplaceDescription(skill.name, skill.description) : localizeGeneratedText(skill.description, language)}</p>
                {!/\p{Script=Han}/u.test(skill.description) && <TranslationBadge />}
                <small>{skill.author || skill.sourceLabel}{skill.installs !== undefined ? ` · ${skill.installs.toLocaleString(localeFor(language))} ${t("次安装", "installs")}` : ""}{skill.stars !== undefined ? ` · ★ ${skill.stars.toLocaleString(localeFor(language))}` : ""}</small>
              </div>
              <div className="market-card-actions">
                <a className="button button-quiet" href={skill.pageUrl} target="_blank" rel="noreferrer">{t("来源", "Source")} <ArrowUpRight size={15} /></a>
                <button className="button button-primary" disabled={!skill.sourceUrl} onClick={() => selectForReview(skill)}>
                  <Download size={15} /> {skill.sourceUrl ? t("审查安装", "Review install") : t("缺少源地址", "Source URL missing")}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : response?.available && !loading ? (
        <div className="empty-state compact"><span>↗</span><h2>{t("等待发现", "Ready to discover")}</h2><p>{t("搜索你下一项想补充的能力。", "Search for the next capability you want to add.")}</p></div>
      ) : null}

      <section className="manual-install">
        <div>
          <span className="eyebrow">{t("安全安装 / GITHUB", "SAFE INSTALL / GITHUB")}</span>
          <h2>{t("从已知源开始安全审查", "Safely review a known source")}</h2>
          <p>{t("不会执行仓库脚本。系统先列出完整目录和风险，只有你再次确认才写入个人技能目录。", "Repository scripts are never executed. Skill Atlas lists the full directory and its risks first, and writes to your personal Skills directory only after a second confirmation.")}</p>
        </div>
        <div className="manual-fields">
          <label>{t("GitHub 地址", "GitHub URL")}<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://github.com/owner/repo/tree/main/path/to/skill" /></label>
          <label>{t("技能名称", "Skill name")} <span>{t("仓库首页地址时需要", "Required for repository root URLs")}</span><input value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder={t("例如 find-skills", "For example: find-skills")} /></label>
          <button className="button button-primary" disabled={installingReview} onClick={() => void inspect()}>{installingReview ? t("正在读取完整目录…", "Reading the complete directory…") : t("生成安装审查单", "Generate installation review")}</button>
        </div>
      </section>

      {installed && (
        <div className="success-toast" role="status"><CheckCircle2 size={20} /><div><strong>{installed.skillName} {t("已完成验证安装", "was verified and installed")}</strong><span>{installed.fileCount} {t("个文件已写入", "files written to")} {installed.targetDirectory}</span></div></div>
      )}
      {review && <InstallationReview review={review} onClose={() => setReview(null)} onInstalled={(result) => { setInstalled(result); setReview(null); }} />}
    </>
  );
}
