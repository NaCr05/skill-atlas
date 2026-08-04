"use client";

import { ArrowUpRight, Download, Search, Trophy } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import {
  clearMarketplaceDiscovery,
  emptyDiscoveryHistory,
  readDiscoveryHistory,
  recordMarketplaceDiscovery,
  removeMarketplaceDiscovery,
  saveMarketplaceDraft,
  type MarketplaceDiscoveryHistoryEntry,
  type MarketplaceSurface,
} from "@/core/discovery-history";
import { localeFor, localizeGeneratedText, localizeMarketplaceNotice } from "@/core/i18n";
import { marketplaceDescriptionLocalizationKind, translatedMarketplaceDescription } from "@/core/skill-translations";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import type { MarketplaceResponse, MarketplaceSkill } from "@/core/marketplaces/adapter";
import { DiscoveryHistoryRail } from "./discovery-history-rail";
import { InstallationReview } from "./installation-review";
import { InstallationSuccess, type DependencyRepairContext } from "./installation-success";
import { useLanguage } from "./language-provider";
import { ProvenanceLabel } from "./provenance-label";
import { TranslationBadge } from "./translation-badge";
import { isAbortedRequest, useLatestRequests } from "./use-latest-request";

function formatHistoryTimestamp(timestamp: string, language: "zh" | "en"): string {
  return new Date(timestamp).toLocaleString(localeFor(language), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MarketplaceClient({
  initialQuery = "",
  initialSourceUrl = "",
  initialSkillName = "",
  repairContext,
}: {
  initialQuery?: string;
  initialSourceUrl?: string;
  initialSkillName?: string;
  repairContext?: DependencyRepairContext;
}) {
  const { language, t } = useLanguage();
  const [provider, setProvider] = useState<"skillsmp" | "skills-sh">("skillsmp");
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [skillName, setSkillName] = useState(initialSkillName);
  const [review, setReview] = useState<Review | null>(null);
  const [installingReview, setInstallingReview] = useState(false);
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState<InstallationResult | null>(null);
  const [installedDescription, setInstalledDescription] = useState("");
  const [discoveryHistory, setDiscoveryHistory] = useState(emptyDiscoveryHistory);
  const requests = useLatestRequests();

  useEffect(() => {
    const restore = () => {
      const history = readDiscoveryHistory();
      const { provider: storedProvider, query: storedQuery } = history.marketplaceDraft;
      const restoredProvider = initialQuery ? "skillsmp" : storedProvider;
      const restoredQuery = initialQuery || storedQuery;
      const restored = restoredProvider === "skills-sh"
        ? history.marketplaceEntries.find((entry) => entry.provider === "skills-sh")
        : history.marketplaceEntries.find((entry) => entry.provider === "skillsmp" && entry.query === restoredQuery);
      setDiscoveryHistory(history);
      setProvider(restoredProvider);
      setQuery(restoredQuery);
      setResponse(restored?.response || null);
    };
    restore();
  }, [initialQuery]);

  async function loadLeaderboard() {
    const request = requests.start("market-query");
    setLoading(true);
    setError("");
    try {
      const result = await fetch("/api/marketplace/skills-sh?view=trending", { signal: request.signal });
      const payload = (await result.json()) as MarketplaceResponse;
      if (!request.isCurrent()) return;
      setResponse(payload);
      setDiscoveryHistory(recordMarketplaceDiscovery({ provider: "skills-sh", query: "", response: payload }));
    } catch (loadError) {
      if (request.isCurrent() && !isAbortedRequest(loadError)) setError(t("排行榜载入失败，可使用网页入口。", "The leaderboard could not be loaded; use the web link instead."));
    } finally {
      if (request.isCurrent()) setLoading(false);
      request.finish();
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (provider !== "skillsmp" || query.trim().length < 1) return;
    const cleanQuery = query.trim();
    const request = requests.start("market-query");
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`/api/marketplace/skillsmp?q=${encodeURIComponent(cleanQuery)}`, { signal: request.signal });
      const payload = (await result.json()) as MarketplaceResponse;
      if (!request.isCurrent()) return;
      setResponse(payload);
      setDiscoveryHistory(recordMarketplaceDiscovery({ provider: "skillsmp", query: cleanQuery, response: payload }));
    } catch (searchError) {
      if (request.isCurrent() && !isAbortedRequest(searchError)) setError(t("市场搜索失败；本地技能管理不受影响。", "Marketplace search failed; local Skill management is unaffected."));
    } finally {
      if (request.isCurrent()) setLoading(false);
      request.finish();
    }
  }

  function changeProvider(nextProvider: MarketplaceSurface) {
    requests.cancel("market-query");
    setLoading(false);
    setProvider(nextProvider);
    setError("");
    const history = saveMarketplaceDraft(nextProvider, query);
    setDiscoveryHistory(history);
    if (nextProvider === "skills-sh") {
      void loadLeaderboard();
      return;
    }
    const restored = history.marketplaceEntries.find((entry) => entry.provider === "skillsmp" && entry.query === query);
    setResponse(restored?.response || null);
  }

  function restoreMarketplaceHistory(entry: MarketplaceDiscoveryHistoryEntry) {
    requests.cancel("market-query");
    setLoading(false);
    setProvider(entry.provider);
    if (entry.provider === "skillsmp") setQuery(entry.query);
    setResponse(entry.response);
    setError("");
    setDiscoveryHistory(saveMarketplaceDraft(entry.provider, entry.provider === "skillsmp" ? entry.query : query));
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
    const request = requests.start("install-review");
    setInstallingReview(true);
    setError("");
    setInstalled(null);
    try {
      const result = await fetch("/api/install/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ sourceUrl: url.trim(), skillName: name.trim() || undefined }),
        signal: request.signal,
      });
      const payload = (await result.json()) as Review & { error?: string };
      if (!result.ok) throw new Error(payload.error || t("无法审查安装源", "Unable to review the installation source"));
      if (!request.isCurrent()) return;
      setReview(payload);
    } catch (inspectError) {
      if (request.isCurrent() && !isAbortedRequest(inspectError)) setError(inspectError instanceof Error ? inspectError.message : t("无法审查安装源", "Unable to review the installation source"));
    } finally {
      if (request.isCurrent()) setInstallingReview(false);
      request.finish();
    }
  }

  return (
    <>
      <section className="market-switcher" aria-label={t("市场来源", "Marketplace sources")}>
        <button data-active={provider === "skillsmp"} onClick={() => changeProvider("skillsmp")}>
          <Search size={18} />
          <span><strong>{t("SkillsMP 搜索", "Search SkillsMP")}</strong><small>{t("按名称与描述发现社区技能", "Discover community Skills by name and description")}</small></span>
        </button>
        <button data-active={provider === "skills-sh"} onClick={() => changeProvider("skills-sh")}>
          <Trophy size={18} />
          <span><strong>{t("skills.sh 排行榜", "skills.sh leaderboard")}</strong><small>{t("查看热门与趋势安装", "Browse popular and trending installations")}</small></span>
        </button>
      </section>

      {provider === "skillsmp" && (
        <form className="market-search" onSubmit={search}>
          <Search size={20} />
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              requests.cancel("market-query");
              setLoading(false);
              setQuery(value);
              const history = saveMarketplaceDraft("skillsmp", value);
              setDiscoveryHistory(history);
              setResponse(history.marketplaceEntries.find((entry) => entry.provider === "skillsmp" && entry.query === value)?.response || null);
            }}
            placeholder={t("例如：前端设计、论文写作、测试", "For example: frontend design, paper writing, testing")}
          />
          <button className="button button-primary" disabled={loading}>{loading ? t("搜索中…", "Searching…") : t("搜索市场", "Search marketplace")}</button>
        </form>
      )}

      <DiscoveryHistoryRail
        title={t("近期搜索", "Recent searches")}
        clearLabel={t("清空", "Clear")}
        removeLabel={(label) => t(`删除搜索记录：${label}`, `Remove search history: ${label}`)}
        items={discoveryHistory.marketplaceEntries.map((entry) => ({
          id: `${entry.provider}:${entry.searchedAt}`,
          label: entry.provider === "skills-sh" ? t("skills.sh 排行榜", "skills.sh leaderboard") : entry.query,
          meta: `${entry.provider === "skillsmp" ? "SkillsMP" : "skills.sh"} · ${formatHistoryTimestamp(entry.searchedAt, language)}`,
        }))}
        onOpen={(id) => {
          const entry = discoveryHistory.marketplaceEntries.find((item) => `${item.provider}:${item.searchedAt}` === id);
          if (entry) restoreMarketplaceHistory(entry);
        }}
        onRemove={(id) => {
          const entry = discoveryHistory.marketplaceEntries.find((item) => `${item.provider}:${item.searchedAt}` === id);
          if (entry) setDiscoveryHistory(removeMarketplaceDiscovery(entry));
        }}
        onClear={() => setDiscoveryHistory(clearMarketplaceDiscovery())}
      />

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
                <TranslationBadge kind={marketplaceDescriptionLocalizationKind(skill.name, skill.description)} />
                <small>{skill.author || skill.sourceLabel}{skill.installs !== undefined ? ` · ${skill.installs.toLocaleString(localeFor(language))} ${t("次安装", "installs")}` : ""}{skill.stars !== undefined ? ` · ★ ${skill.stars.toLocaleString(localeFor(language))}` : ""}</small>
              </div>
              <div className="market-card-actions">
                <a className="button button-quiet" href={skill.pageUrl} target="_blank" rel="noreferrer">{t("来源", "Source")} <ArrowUpRight size={15} /></a>
                <button className="button button-primary" disabled={!skill.sourceUrl} onClick={() => selectForReview(skill)}>
                  <Download size={15} /> {skill.sourceUrl ? t("审查并安装", "Review and install") : t("缺少源地址", "Source URL missing")}
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

      {installed && <InstallationSuccess result={installed} description={installedDescription} repairContext={repairContext} />}
      {review && <InstallationReview review={review} onClose={() => setReview(null)} onInstalled={(result) => { setInstalledDescription(review.description); setInstalled(result); setReview(null); }} />}
    </>
  );
}
