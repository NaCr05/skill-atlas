"use client";

import {
  ArrowUpRight,
  ArrowRight,
  BrainCircuit,
  Check,
  Clock3,
  Copy,
  Search,
  SearchX,
  Store,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import type {
  AiAssistResponse,
  MarketCandidateRankingResult,
  PersonalAssistantResult,
  SkillCompositionResult,
  TaskRecommendationResult,
} from "@/core/ai/assist-contract";
import {
  clearTaskDiscovery,
  emptyDiscoveryHistory,
  readDiscoveryHistory,
  recordTaskDiscovery,
  removeTaskDiscovery,
  saveTaskDraft,
  type TaskDiscoveryHistoryEntry,
} from "@/core/discovery-history";
import { localeFor, localizeGeneratedText, localizeMarketplaceNotice } from "@/core/i18n";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import { medianCopyJourneyMs, recordZeroResultSearch, type LocalWorkspaceState } from "@/core/local-workspace";
import type { MarketplaceResponse, MarketplaceSkill } from "@/core/marketplaces/adapter";
import { selectMarketCandidates } from "@/core/marketplaces/candidates";
import { translatedMarketplaceDescription } from "@/core/skill-translations";
import { recommendSkills } from "@/core/skills/recommend";
import { catalogResultGroups } from "@/core/skills/catalog";
import type { SkillSummary } from "@/core/skills/types";
import { aiAssistErrorText, requestAiAssist } from "./ai-assist-client";
import { CatalogResultGroups } from "./catalog-result-groups";
import { DiscoveryHistoryRail } from "./discovery-history-rail";
import { InstallationReview } from "./installation-review";
import { InstallationSuccess } from "./installation-success";
import { useLanguage } from "./language-provider";
import { isAbortedRequest, useLatestRequests } from "./use-latest-request";

function formatDuration(milliseconds: number | undefined, language: "zh" | "en"): string {
  if (milliseconds === undefined) return language === "zh" ? "暂无数据" : "No data yet";
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return language === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return language === "zh" ? `${minutes} 分 ${remainder} 秒` : `${minutes}m ${remainder}s`;
}

function providerLabel(provider: "openai" | "deepseek"): string {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}

function formatHistoryTimestamp(timestamp: string, language: "zh" | "en"): string {
  return new Date(timestamp).toLocaleString(localeFor(language), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskRecommender({
  skills,
  workspace,
  query,
  onQueryChange,
  searchInputRef,
  onSelect,
  onClear,
}: {
  skills: SkillSummary[];
  workspace: LocalWorkspaceState;
  query: string;
  onQueryChange: (query: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSelect: (skill: SkillSummary) => void;
  onClear: () => void;
}) {
  const { language, t } = useLanguage();
  const task = query;
  const setTask = onQueryChange;
  const [submitted, setSubmitted] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<AiAssistResponse<"task-recommendation"> | null>(null);
  const [composition, setComposition] = useState<AiAssistResponse<"skill-composition"> | null>(null);
  const [personalAdvice, setPersonalAdvice] = useState<AiAssistResponse<"personal-assistant"> | null>(null);
  const [marketCandidates, setMarketCandidates] = useState<MarketplaceSkill[]>([]);
  const [marketResponses, setMarketResponses] = useState<MarketplaceResponse[]>([]);
  const [marketSearched, setMarketSearched] = useState(false);
  const [marketSearching, setMarketSearching] = useState(false);
  const [marketRanking, setMarketRanking] = useState<AiAssistResponse<"market-candidate-ranking"> | null>(null);
  const [marketError, setMarketError] = useState("");
  const [installReview, setInstallReview] = useState<Review | null>(null);
  const [installingCandidateId, setInstallingCandidateId] = useState("");
  const [installError, setInstallError] = useState("");
  const [installed, setInstalled] = useState<InstallationResult | null>(null);
  const [installedDescription, setInstalledDescription] = useState("");
  const [aiWorking, setAiWorking] = useState<"recommend" | "compose" | "personal" | "market" | null>(null);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  const [discoveryHistory, setDiscoveryHistory] = useState(emptyDiscoveryHistory);
  const requests = useLatestRequests();
  const restoredHistory = useRef(false);
  const median = useMemo(() => medianCopyJourneyMs(workspace), [workspace]);
  const recommendations = useMemo(
    () => recommendSkills(skills, task, language),
    [language, skills, task],
  );
  const resultGroups = useMemo(
    () => catalogResultGroups(skills, task, language, workspace.recentCopies.map((item) => item.skillId)),
    [language, skills, task, workspace.recentCopies],
  );
  const flattenedResults = useMemo(() => resultGroups.flatMap((group) => group.items), [resultGroups]);
  const byName = useMemo(() => new Map(skills.map((skill) => [skill.name, skill])), [skills]);

  useEffect(() => {
    if (restoredHistory.current) return;
    restoredHistory.current = true;
    const restore = () => {
      const history = readDiscoveryHistory();
      const draft = task || history.taskDraft;
      const restored = history.taskEntries.find((entry) => entry.query === draft);
      setDiscoveryHistory(history);
      if (!task) setTask(draft);
      if (!restored) return;
      setSubmitted(true);
      setAiRecommendation(restored.aiResponse || null);
      const names = restored.aiResponse
        ? restored.aiResponse.result.recommendations.map((item) => item.skillName)
        : recommendSkills(skills, restored.query, language).slice(0, 3).map((item) => item.skill.name);
      setSelectedIds(names.flatMap((name) => {
        const skill = byName.get(name);
        return skill ? [skill.id] : [];
      }).slice(0, 5));
    };
    restore();
  }, [byName, language, setTask, skills, task]);

  function resetAiResults() {
    setAiRecommendation(null);
    setComposition(null);
    setAiError("");
  }

  function resetMarketResults() {
    setMarketCandidates([]);
    setMarketResponses([]);
    setMarketSearched(false);
    setMarketRanking(null);
    setMarketError("");
    setInstallReview(null);
    setInstallingCandidateId("");
    setInstallError("");
    setInstalled(null);
    setInstalledDescription("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    requests.cancelMany(["task-ai", "task-market", "install-review"]);
    setAiWorking(null);
    setMarketSearching(false);
    const cleanTask = task.trim();
    const next = recommendSkills(skills, cleanTask, language);
    setTask(cleanTask);
    setSubmitted(true);
    setSelectedIds(next.slice(0, 3).map((item) => item.skill.id));
    resetAiResults();
    setDiscoveryHistory(recordTaskDiscovery({ query: cleanTask, mode: "local" }));
    if (cleanTask && !next.length) recordZeroResultSearch(cleanTask, "task-recommendation");
  }

  async function askAiForRecommendations() {
    const request = requests.start("task-ai");
    const taskSnapshot = task.trim();
    setAiWorking("recommend");
    setAiError("");
    setComposition(null);
    try {
      const response = await requestAiAssist({ action: "task-recommendation", language, task: taskSnapshot }, { signal: request.signal });
      if (!request.isCurrent()) return;
      setAiRecommendation(response);
      setSubmitted(true);
      setDiscoveryHistory(recordTaskDiscovery({ query: taskSnapshot, mode: "ai", aiResponse: response }));
      setSelectedIds(response.result.recommendations
        .map((item) => byName.get(item.skillName)?.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 5));
    } catch (error) {
      if (request.isCurrent() && !isAbortedRequest(error)) setAiError(aiAssistErrorText(error, language));
    } finally {
      if (request.isCurrent()) setAiWorking(null);
      request.finish();
    }
  }

  function restoreTaskHistory(entry: TaskDiscoveryHistoryEntry) {
    requests.cancelMany(["task-ai", "task-market", "install-review"]);
    setAiWorking(null);
    setMarketSearching(false);
    setTask(entry.query);
    setSubmitted(true);
    setAiRecommendation(entry.aiResponse || null);
    setComposition(null);
    setAiError("");
    resetMarketResults();
    const names = entry.aiResponse
      ? entry.aiResponse.result.recommendations.map((item) => item.skillName)
      : recommendSkills(skills, entry.query, language).slice(0, 3).map((item) => item.skill.name);
    setSelectedIds(names.flatMap((name) => {
      const skill = byName.get(name);
      return skill ? [skill.id] : [];
    }).slice(0, 5));
    setDiscoveryHistory(saveTaskDraft(entry.query));
  }

  async function composeSkills() {
    const request = requests.start("task-ai");
    setAiWorking("compose");
    setAiError("");
    setCopied(false);
    try {
      const result = await requestAiAssist({
        action: "skill-composition",
        language,
        task: task.trim(),
        skillIds: selectedIds.slice(0, 8),
      }, { signal: request.signal });
      if (request.isCurrent()) setComposition(result);
    } catch (error) {
      if (request.isCurrent() && !isAbortedRequest(error)) setAiError(aiAssistErrorText(error, language));
    } finally {
      if (request.isCurrent()) setAiWorking(null);
      request.finish();
    }
  }

  async function askPersonalAssistant() {
    const request = requests.start("task-ai");
    setAiWorking("personal");
    setAiError("");
    try {
      const result = await requestAiAssist({
        action: "personal-assistant",
        language,
        workspace: {
          favoriteSkillIds: workspace.favorites,
          pinnedSkillIds: workspace.pinned,
          recentSkillIds: workspace.recentCopies.map((item) => item.skillId),
          zeroResultQueries: workspace.analytics.zeroResultSearches.map((item) => item.query),
          copyJourneyMedianMs: median,
        },
      }, { signal: request.signal });
      if (request.isCurrent()) setPersonalAdvice(result);
    } catch (error) {
      if (request.isCurrent() && !isAbortedRequest(error)) setAiError(aiAssistErrorText(error, language));
    } finally {
      if (request.isCurrent()) setAiWorking(null);
      request.finish();
    }
  }

  async function searchMarketCandidates() {
    const request = requests.start("task-market");
    const taskSnapshot = task.trim();
    setMarketSearching(true);
    setMarketError("");
    setMarketRanking(null);
    try {
      const [skillsMpResponse, skillsShResponse] = await Promise.all([
        fetch(`/api/marketplace/skillsmp?q=${encodeURIComponent(taskSnapshot)}`, { cache: "no-store", signal: request.signal }),
        fetch("/api/marketplace/skills-sh?view=trending", { cache: "no-store", signal: request.signal }),
      ]);
      const responses = await Promise.all([
        skillsMpResponse.json() as Promise<MarketplaceResponse>,
        skillsShResponse.json() as Promise<MarketplaceResponse>,
      ]);
      if (!request.isCurrent()) return;
      setMarketResponses(responses);
      setMarketCandidates(selectMarketCandidates(responses, skills.map((skill) => skill.name), taskSnapshot));
      setMarketSearched(true);
    } catch (searchError) {
      if (request.isCurrent() && !isAbortedRequest(searchError)) {
        setMarketResponses([]);
        setMarketCandidates([]);
        setMarketSearched(true);
        setMarketError(t("市场候选暂时无法读取，本机推荐不受影响。", "Market candidates are temporarily unavailable. Local recommendations are unaffected."));
      }
    } finally {
      if (request.isCurrent()) setMarketSearching(false);
      request.finish();
    }
  }

  async function rankMarketCandidates() {
    const request = requests.start("task-ai");
    setAiWorking("market");
    setAiError("");
    try {
      const result = await requestAiAssist({
        action: "market-candidate-ranking",
        language,
        task: task.trim(),
        candidates: marketCandidates.slice(0, 20).map(({ id, name, description, author, sourceLabel, sourceUrl, pageUrl, installs, stars }) => ({
          id,
          name,
          description,
          author,
          sourceLabel,
          sourceUrl,
          pageUrl,
          installs,
          stars,
        })),
      }, { signal: request.signal });
      if (request.isCurrent()) setMarketRanking(result);
    } catch (error) {
      if (request.isCurrent() && !isAbortedRequest(error)) setAiError(aiAssistErrorText(error, language));
    } finally {
      if (request.isCurrent()) setAiWorking(null);
      request.finish();
    }
  }

  async function inspectMarketCandidate(candidate: MarketplaceSkill) {
    if (!candidate.sourceUrl?.startsWith("https://github.com/")) {
      setInstallError(t("这个候选没有可审查的 GitHub 地址。", "This candidate does not provide a reviewable GitHub URL."));
      return;
    }
    const request = requests.start("install-review");
    setInstallingCandidateId(candidate.id);
    setInstallError("");
    setInstalled(null);
    try {
      const response = await fetch("/api/install/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ sourceUrl: candidate.sourceUrl, skillName: candidate.name }),
        signal: request.signal,
      });
      const payload = (await response.json()) as Review & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法审查安装源", "Unable to review the installation source"));
      if (request.isCurrent()) {
        setInstalledDescription(candidate.description);
        setInstallReview(payload);
      }
    } catch (error) {
      if (request.isCurrent() && !isAbortedRequest(error)) setInstallError(error instanceof Error ? error.message : t("无法审查安装源", "Unable to review the installation source"));
    } finally {
      if (request.isCurrent()) setInstallingCandidateId("");
      request.finish();
    }
  }

  function toggleSelected(skillId: string) {
    setSelectedIds((current) => current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : current.length < 8 ? [...current, skillId] : current);
    setComposition(null);
  }

  async function copyCombinedPrompt(result: SkillCompositionResult) {
    await navigator.clipboard.writeText(result.combinedPrompt);
    setCopied(true);
  }

  const aiResultSkills = aiRecommendation?.result.recommendations.map((item) => ({
    ...item,
    skill: byName.get(item.skillName),
  })).filter((item): item is typeof item & { skill: SkillSummary } => Boolean(item.skill)) || [];
  const marketById = new Map(marketCandidates.map((candidate) => [candidate.id, candidate]));
  const displayedMarketCandidates = marketRanking
    ? marketRanking.result.recommendations.flatMap((recommendation) => {
      const candidate = marketById.get(recommendation.candidateId);
      return candidate ? [{ candidate, recommendation }] : [];
    })
    : marketCandidates.map((candidate) => ({ candidate, recommendation: undefined }));

  return (
    <section className="task-finder" aria-labelledby="task-finder-title">
      <div className="task-finder-main">
        <div className="task-finder-heading">
          <span id="task-finder-title"><Sparkles size={16} aria-hidden="true" /> {t("查找 Skill", "Find a Skill")}</span>
          <small>{t("输入名称、功能或任务；本地结果即时生成，AI 与市场仅在点击后调用", "Enter a name, capability, or task. Local results are instant; AI and market search run only when clicked.")}</small>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="catalog-command-input" className="sr-only">{t("任务描述：搜索技能或描述任务", "Task description: search Skills or describe a task")}</label>
          <div className="catalog-command-input-wrap">
            <Search size={19} aria-hidden="true" />
            <input
            ref={searchInputRef}
            id="catalog-command-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="catalog-command-results"
            aria-expanded={resultGroups.length > 0}
            aria-activedescendant={activeResultIndex >= 0 ? `catalog-option-${flattenedResults[activeResultIndex]?.skill.id}` : undefined}
            value={task}
            onChange={(event) => {
              const value = event.target.value;
              requests.cancelMany(["task-ai", "task-market", "install-review"]);
              setAiWorking(null);
              setMarketSearching(false);
              setTask(value);
              setActiveResultIndex(-1);
              setDiscoveryHistory(saveTaskDraft(value));
              setSubmitted(false);
              setSelectedIds([]);
              resetAiResults();
              resetMarketResults();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && flattenedResults.length) {
                event.preventDefault();
                setActiveResultIndex((current) => Math.min(flattenedResults.length - 1, current + 1));
              } else if (event.key === "ArrowUp" && flattenedResults.length) {
                event.preventDefault();
                setActiveResultIndex((current) => Math.max(0, current <= 0 ? flattenedResults.length - 1 : current - 1));
              } else if (event.key === "Enter" && activeResultIndex >= 0) {
                event.preventDefault();
                const active = flattenedResults[activeResultIndex];
                if (active) onSelect(active.skill);
              } else if (event.key === "Escape") {
                setActiveResultIndex(-1);
              }
            }}
            placeholder={t("搜索 Skill，或描述你想完成的任务…", "Search Skills, or describe what you want to accomplish…")}
          />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="task-action-stack">
            <button className="button button-quiet" type="submit" disabled={!task.trim()}>
              {t("推荐技能", "Recommend Skills")} <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button className="button button-ai" type="button" disabled={!task.trim() || aiWorking !== null} onClick={() => void askAiForRecommendations()}>
              <WandSparkles size={15} aria-hidden="true" />
              {aiWorking === "recommend" ? t("AI 分析中…", "AI analyzing…") : t("AI 深度推荐", "AI deep match")}
            </button>
            <Link className="button button-market" href={task.trim() ? `/marketplace?q=${encodeURIComponent(task.trim())}` : "/marketplace"}>
              <Store size={15} aria-hidden="true" /> {t("搜索市场", "Search marketplace")}
            </Link>
          </div>
        </form>

        <DiscoveryHistoryRail
          title={t("近期任务", "Recent tasks")}
          clearLabel={t("清空", "Clear")}
          removeLabel={(label) => t(`删除任务记录：${label}`, `Remove task history: ${label}`)}
          items={discoveryHistory.taskEntries.map((entry) => ({
            id: `${entry.mode}:${entry.searchedAt}`,
            label: entry.query,
            meta: `${entry.mode === "ai" ? `${providerLabel(entry.aiResponse!.provider)} · ${t("AI 结果", "AI result")}` : t("本地推荐", "Local match")} · ${formatHistoryTimestamp(entry.searchedAt, language)}`,
          }))}
          onOpen={(id) => {
            const entry = discoveryHistory.taskEntries.find((item) => `${item.mode}:${item.searchedAt}` === id);
            if (entry) restoreTaskHistory(entry);
          }}
          onRemove={(id) => {
            const entry = discoveryHistory.taskEntries.find((item) => `${item.mode}:${item.searchedAt}` === id);
            if (entry) setDiscoveryHistory(removeTaskDiscovery(entry));
          }}
          onClear={() => setDiscoveryHistory(clearTaskDiscovery())}
        />

        {resultGroups.length > 0 && !aiRecommendation && (
          <CatalogResultGroups
            groups={resultGroups}
            activeSkillId={flattenedResults[activeResultIndex]?.skill.id}
            selectedIds={selectedIds}
            onOpen={onSelect}
            onToggle={toggleSelected}
          />
        )}

        {submitted && task.trim() && recommendations.length === 0 && !aiRecommendation && (
          <p className="task-no-result"><SearchX size={15} aria-hidden="true" /> {t("暂时没有高置信度匹配，已记录到本地零结果统计。", "No high-confidence local match. This was recorded in local zero-result statistics.")}</p>
        )}

        {selectedIds.length >= 2 && (
          <div className="composition-entry">
            <div>
              <strong>{t(`已选择 ${selectedIds.length} 个 Skill`, `${selectedIds.length} Skills selected`)}</strong>
              <small>{t("点击后，AI 才会规划顺序、交接方式并生成组合 Prompt。", "AI runs only after the click to plan order, handoffs, and a combined prompt.")}</small>
            </div>
            <button className="button button-ai" type="button" disabled={aiWorking !== null} onClick={() => void composeSkills()}>
              <Workflow size={15} /> {aiWorking === "compose" ? t("正在编排…", "Composing…") : t("智能组合 Skill", "Compose Skills")}
            </button>
          </div>
        )}
      </div>

      <aside className="local-insights" aria-label={t("本地使用洞察", "Local usage insights")}>
        <div className="local-insights-heading">
          <span>{t("个人使用助手", "Personal assistant")}</span>
          <div>
            <small>{t("备注正文不会发送", "Note bodies are never sent")}</small>
            <button
              type="button"
              disabled={!workspace.favorites.length && !workspace.pinned.length && !Object.keys(workspace.notes).length && !workspace.recentCopies.length && !workspace.analytics.zeroResultSearches.length}
              onClick={() => {
                if (window.confirm(t("清除收藏、置顶、备注、最近复制和本地统计？", "Clear favorites, pins, notes, recent copies, and local analytics?"))) onClear();
              }}
            >
              {t("清除", "Clear")}
            </button>
          </div>
        </div>
        <div className="insight-metrics">
          <div><SearchX size={15} aria-hidden="true" /><span>{t("零结果搜索", "Zero-result searches")}</span><strong>{workspace.analytics.zeroResultSearches.length}</strong></div>
          <div><Clock3 size={15} aria-hidden="true" /><span>{t("找到后到复制", "Found-to-copy median")}</span><strong>{formatDuration(median, language)}</strong></div>
        </div>
        {workspace.analytics.zeroResultSearches.length > 0 && (
          <p>{t("最近：", "Recent: ")}{workspace.analytics.zeroResultSearches.slice(0, 3).map((item) => item.query).join("、")}</p>
        )}
        <button className="button button-ai personal-assistant-button" type="button" disabled={aiWorking !== null} onClick={() => void askPersonalAssistant()}>
          <BrainCircuit size={15} /> {aiWorking === "personal" ? t("正在分析…", "Analyzing…") : t("分析我的使用习惯", "Analyze my usage")}
        </button>
        <small className="ai-data-disclosure">{t("点击后仅发送收藏、置顶、最近复制的 Skill 标识、零结果搜索词和汇总统计。", "On click, only Skill IDs from favorites, pins, recent copies, zero-result query text, and aggregate metrics are sent.")}</small>
      </aside>

      {task.trim() && (submitted || aiRecommendation) && (
        <section className="market-candidate-zone" aria-labelledby="market-candidate-title">
          <div className="market-candidate-entry">
            <div>
              <span className="market-zone-kicker"><Store size={15} /> {t("扩展能力", "Extend capabilities")}</span>
              <strong id="market-candidate-title">{t("还想看看尚未安装的 Skill？", "Want to explore Skills not installed yet?")}</strong>
              <small>{t("市场搜索与 AI 筛选分开触发；候选不能直接调用或加入组合。", "Market search and AI ranking are separate actions. Candidates cannot be invoked or added to a flow yet.")}</small>
            </div>
            <button className="button button-market" type="button" disabled={marketSearching} onClick={() => void searchMarketCandidates()}>
              <Store size={15} /> {marketSearching ? t("正在搜索市场…", "Searching marketplaces…") : marketSearched ? t("重新搜索市场候选", "Search again") : t("搜索市场候选", "Search market candidates")}
            </button>
          </div>

          {marketError && <p className="market-inline-error">{marketError}</p>}
          {installError && <p className="market-inline-error">{installError}</p>}
          {marketSearched && marketResponses.some((response) => response.notice) && (
            <div className="market-source-notices">
              {marketResponses.filter((response) => response.notice).map((response) => (
                <small key={response.provider}><b>{response.provider}</b> · {localizeMarketplaceNotice(response.notice || "", language)}</small>
              ))}
            </div>
          )}

          {marketSearched && marketCandidates.length === 0 && !marketError && (
            <div className="market-candidate-empty">
              <SearchX size={18} />
              <div><strong>{t("没有找到可信的未安装候选", "No trustworthy uninstalled candidate found")}</strong><small>{t("可以换一种任务描述，或前往技能市场手动搜索。", "Try another task description or search the marketplace manually.")}</small></div>
              <Link className="button button-quiet" href="/marketplace">{t("打开技能市场", "Open marketplace")} <ArrowRight size={14} /></Link>
            </div>
          )}

          {marketCandidates.length > 0 && (
            <>
              <div className="market-candidate-toolbar">
                <div><strong>{t(`找到 ${marketCandidates.length} 个尚未安装的候选`, `${marketCandidates.length} uninstalled candidates found`)}</strong><small>{t("先查看真实市场结果；需要时再让 AI 进行筛选。", "Review grounded market results first, then ask AI to rank them if useful.")}</small></div>
                <button className="button button-ai" type="button" disabled={aiWorking !== null} onClick={() => void rankMarketCandidates()}><WandSparkles size={15} /> {aiWorking === "market" ? t("AI 筛选中…", "AI ranking…") : t("AI 筛选这些候选", "Rank candidates with AI")}</button>
              </div>

              {marketRanking && (
                <div className="market-ai-summary">
                  <span><WandSparkles size={15} /> {providerLabel(marketRanking.provider)} · {t("按需生成", "Generated on demand")}</span>
                  <p>{marketRanking.result.summary}</p>
                  <small><b>{t("能力缺口：", "Capability gap: ")}</b>{marketRanking.result.capabilityGap}</small>
                </div>
              )}

              <div className="market-candidate-grid">
                {displayedMarketCandidates.map(({ candidate, recommendation }) => (
                  <MarketCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    recommendation={recommendation}
                    language={language}
                    inspecting={installingCandidateId === candidate.id}
                    onReview={inspectMarketCandidate}
                  />
                ))}
              </div>
              {marketRanking && <p className="market-next-step">{marketRanking.result.nextStep}</p>}
            </>
          )}
        </section>
      )}

      {aiError && <p className="ai-inline-error">{aiError}</p>}

      {aiRecommendation && (
        <AiRecommendationCard result={aiRecommendation.result} provider={providerLabel(aiRecommendation.provider)} skills={aiResultSkills} selectedIds={selectedIds} onSelect={onSelect} onToggle={toggleSelected} language={language} />
      )}

      {composition && (
        <article className="ai-advisory-card ai-composition-card">
          <header><span><Workflow size={16} /> {t("AI 组合方案", "AI composition")}</span><small>{providerLabel(composition.provider)} · {t("建议，不会自动执行", "Advisory; never auto-runs")}</small></header>
          <h3>{composition.result.title}</h3>
          <p>{composition.result.rationale}</p>
          <ol>{composition.result.steps.map((step) => <li key={step.skillName}><strong>${step.skillName}</strong><span>{step.goal}</span><small>{t("交接：", "Handoff: ")}{step.handoff}</small></li>)}</ol>
          <div className="ai-prompt-preview"><pre>{composition.result.combinedPrompt}</pre><button className="button button-primary" type="button" onClick={() => void copyCombinedPrompt(composition.result)}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t("已复制", "Copied") : t("复制组合 Prompt", "Copy combined prompt")}</button></div>
        </article>
      )}

      {personalAdvice && <PersonalAdviceCard result={personalAdvice.result} provider={providerLabel(personalAdvice.provider)} language={language} onSelect={(name) => { const skill = byName.get(name); if (skill) onSelect(skill); }} />}
      {installed && <InstallationSuccess result={installed} description={installedDescription} />}
      {installReview && <InstallationReview review={installReview} onClose={() => setInstallReview(null)} onInstalled={(result) => { setInstalled(result); setInstallReview(null); }} />}
    </section>
  );
}

function AiRecommendationCard({ result, provider, skills, selectedIds, onSelect, onToggle, language }: {
  result: TaskRecommendationResult;
  provider: string;
  skills: Array<TaskRecommendationResult["recommendations"][number] & { skill: SkillSummary }>;
  selectedIds: string[];
  onSelect: (skill: SkillSummary) => void;
  onToggle: (skillId: string) => void;
  language: "zh" | "en";
}) {
  return <article className="ai-advisory-card ai-task-card">
    <header><span><WandSparkles size={16} /> {language === "zh" ? "AI 深度推荐" : "AI deep match"}</span><small>{provider} · {language === "zh" ? "按需生成" : "Generated on demand"}</small></header>
    <p>{result.summary}</p>
    <div className="ai-skill-suggestions">{skills.map((item) => <div key={item.skill.id} data-selected={selectedIds.includes(item.skill.id)}><button type="button" onClick={() => onSelect(item.skill)}><strong>{item.skill.displayName}</strong><code>${item.skill.name}</code><span>{item.reason}</span></button><label><input type="checkbox" checked={selectedIds.includes(item.skill.id)} onChange={() => onToggle(item.skill.id)} /> {language === "zh" ? "加入组合" : "Add to flow"}</label></div>)}</div>
    <small className="ai-next-step">{result.nextStep}</small>
  </article>;
}

function MarketCandidateCard({
  candidate,
  recommendation,
  language,
  inspecting,
  onReview,
}: {
  candidate: MarketplaceSkill;
  recommendation?: MarketCandidateRankingResult["recommendations"][number];
  language: "zh" | "en";
  inspecting: boolean;
  onReview: (candidate: MarketplaceSkill) => void;
}) {
  const reviewable = candidate.sourceUrl?.startsWith("https://github.com/") === true;
  const description = language === "zh"
    ? translatedMarketplaceDescription(candidate.name, candidate.description)
    : localizeGeneratedText(candidate.description, language);
  return <article className="market-candidate-card" data-ai-ranked={Boolean(recommendation)}>
    <header>
      <span>{language === "zh" ? "未安装" : "NOT INSTALLED"}</span>
      <small>{candidate.sourceLabel}</small>
    </header>
    <h3>{candidate.name}</h3>
    <p>{recommendation?.reason || description}</p>
    {recommendation?.complements.length ? <div className="market-complements"><span>{language === "zh" ? "可搭配" : "Pairs with"}</span>{recommendation.complements.map((name) => <code key={name}>${name}</code>)}</div> : null}
    <div className="market-candidate-meta">
      <span>{candidate.author || (language === "zh" ? "作者未知" : "Unknown author")}</span>
      {candidate.stars !== undefined && <span>★ {candidate.stars.toLocaleString()}</span>}
      {candidate.installs !== undefined && <span>{candidate.installs.toLocaleString()} {language === "zh" ? "次安装" : "installs"}</span>}
      {recommendation && <span data-confidence={recommendation.confidence}>{recommendation.confidence.toLocaleUpperCase()}</span>}
    </div>
    <footer>
      <a className="button button-quiet" href={candidate.pageUrl} target="_blank" rel="noreferrer">{language === "zh" ? "查看来源" : "View source"} <ArrowUpRight size={14} /></a>
      {reviewable ? (
        <button className="button button-market" type="button" disabled={inspecting} onClick={() => onReview(candidate)}>
          {inspecting ? (language === "zh" ? "正在生成审查单…" : "Preparing review…") : (language === "zh" ? "审查并安装" : "Review and install")} <ArrowRight size={14} />
        </button>
      ) : (
        <button className="button button-market" type="button" disabled title={language === "zh" ? "市场没有提供可审查的 GitHub 地址" : "No reviewable GitHub URL was provided"}>{language === "zh" ? "缺少 GitHub 地址" : "GitHub URL missing"}</button>
      )}
    </footer>
  </article>;
}

function PersonalAdviceCard({ result, provider, language, onSelect }: { result: PersonalAssistantResult; provider: string; language: "zh" | "en"; onSelect: (name: string) => void }) {
  return <article className="ai-advisory-card ai-personal-card">
    <header><span><BrainCircuit size={16} /> {language === "zh" ? "个人使用建议" : "Personal usage advice"}</span><small>{provider} · {language === "zh" ? "不含备注正文" : "No note bodies sent"}</small></header>
    <p>{result.summary}</p>
    {result.habits.length > 0 && <ul>{result.habits.map((habit) => <li key={habit}>{habit}</li>)}</ul>}
    <div className="ai-personal-suggestions">{result.suggestions.map((suggestion) => <button key={suggestion.skillName} type="button" onClick={() => onSelect(suggestion.skillName)}><strong>${suggestion.skillName}</strong><span>{suggestion.reason}</span><small>{suggestion.exampleTask}</small></button>)}</div>
  </article>;
}
