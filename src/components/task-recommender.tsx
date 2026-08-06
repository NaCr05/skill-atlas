"use client";

import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
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
import { localeFor } from "@/core/i18n";
import { translateMessage } from "@/core/i18n/messages";
import { medianCopyJourneyMs, recordZeroResultSearch, type LocalWorkspaceState } from "@/core/local-workspace";
import { recommendSkills } from "@/core/skills/recommend";
import { catalogResultGroups } from "@/core/skills/catalog";
import type { SkillSummary } from "@/core/skills/types";
import { aiAssistErrorText, requestAiAssist } from "./ai-assist-client";
import { CatalogResultGroups } from "./catalog-result-groups";
import { DiscoveryHistoryRail } from "./discovery-history-rail";
import { useLanguage } from "./language-provider";
import { isAbortedRequest, useLatestRequests } from "./use-latest-request";
import { MarketplaceCandidateZone } from "./task-discovery/marketplace-candidate-zone";

function formatDuration(milliseconds: number | undefined, language: "zh" | "en"): string {
  if (milliseconds === undefined) return translateMessage("task.noData", language);
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return translateMessage("task.seconds", language, { seconds });
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return translateMessage("task.minutesSeconds", language, { minutes, seconds: remainder });
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
  const { language, m } = useLanguage();
  const task = query;
  const setTask = onQueryChange;
  const [submitted, setSubmitted] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [aiRecommendation, setAiRecommendation] = useState<AiAssistResponse<"task-recommendation"> | null>(null);
  const [composition, setComposition] = useState<AiAssistResponse<"skill-composition"> | null>(null);
  const [personalAdvice, setPersonalAdvice] = useState<AiAssistResponse<"personal-assistant"> | null>(null);
  const [aiWorking, setAiWorking] = useState<"recommend" | "compose" | "personal" | null>(null);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
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

  function submit(event: FormEvent) {
    event.preventDefault();
    requests.cancel("task-ai");
    setAiWorking(null);
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
    requests.cancel("task-ai");
    setAiWorking(null);
    setTask(entry.query);
    setSubmitted(true);
    setAiRecommendation(entry.aiResponse || null);
    setComposition(null);
    setAiError("");
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
  return (
    <section className="task-finder" aria-labelledby="task-finder-title">
      <div className="task-finder-main">
        <div className="task-finder-heading">
          <span id="task-finder-title"><Sparkles size={16} aria-hidden="true" /> {m("task.title")}</span>
          <small>{m("task.hint")}</small>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="catalog-command-input" className="sr-only">{m("task.inputLabel")}</label>
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
              requests.cancel("task-ai");
              setAiWorking(null);
              setTask(value);
              setActiveResultIndex(-1);
              setDiscoveryHistory(saveTaskDraft(value));
              setSubmitted(false);
              setSelectedIds([]);
              resetAiResults();
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
            placeholder={m("task.placeholder")}
          />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="task-action-stack">
            <button className="button button-quiet" type="submit" disabled={!task.trim()}>
              <span className="task-action-label-long">{m("task.recommend")}</span>
              <span className="task-action-label-short">{m("task.recommendShort")}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <button className="button button-ai" type="button" disabled={!task.trim() || aiWorking !== null} onClick={() => void askAiForRecommendations()}>
              <WandSparkles size={15} aria-hidden="true" />
              <span className="task-action-label-long">{aiWorking === "recommend" ? m("task.aiAnalyzing") : m("task.aiDeepMatch")}</span>
              <span className="task-action-label-short">{m("task.aiShort")}</span>
            </button>
            <Link className="button button-market" href={task.trim() ? `/marketplace?q=${encodeURIComponent(task.trim())}` : "/marketplace"}>
              <Store size={15} aria-hidden="true" />
              <span className="task-action-label-long">{m("task.searchMarketplace")}</span>
              <span className="task-action-label-short">{m("task.marketShort")}</span>
            </Link>
          </div>
        </form>

        <DiscoveryHistoryRail
          title={m("task.recentTasks")}
          clearLabel={m("task.clear")}
          removeLabel={(label) => m("task.removeHistory", { label })}
          items={discoveryHistory.taskEntries.map((entry) => ({
            id: `${entry.mode}:${entry.searchedAt}`,
            label: entry.query,
            meta: `${entry.mode === "ai" ? `${providerLabel(entry.aiResponse!.provider)} · ${m("task.aiResult")}` : m("task.localMatch")} · ${formatHistoryTimestamp(entry.searchedAt, language)}`,
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
          <p className="task-no-result"><SearchX size={15} aria-hidden="true" /> {m("task.noResult")}</p>
        )}

        {selectedIds.length >= 2 && (
          <div className="composition-entry">
            <div>
              <strong>{m("task.selectedCount", { count: selectedIds.length })}</strong>
              <small>{m("task.compositionHint")}</small>
            </div>
            <button className="button button-ai" type="button" disabled={aiWorking !== null} onClick={() => void composeSkills()}>
              <Workflow size={15} /> {aiWorking === "compose" ? m("task.composing") : m("task.compose")}
            </button>
          </div>
        )}
      </div>

      <aside className="local-insights" aria-label={m("task.localInsights")}>
        <div className="local-insights-heading">
          <span>{m("task.personalAssistant")}</span>
          <div>
            <button
              className="local-insights-toggle"
              type="button"
              aria-expanded={insightsOpen}
              aria-controls="local-insights-body"
              onClick={() => setInsightsOpen((current) => !current)}
            >
              <ChevronDown size={14} aria-hidden="true" />
              <span>{insightsOpen ? m("task.collapseInsights") : m("task.expandInsights")}</span>
            </button>
            <small>{m("task.noteBodiesPrivate")}</small>
            <button
              type="button"
              disabled={!workspace.favorites.length && !workspace.pinned.length && !Object.keys(workspace.notes).length && !workspace.recentCopies.length && !workspace.analytics.zeroResultSearches.length}
              onClick={() => {
                if (window.confirm(m("task.clearWorkspaceConfirm"))) onClear();
              }}
            >
              {m("task.clear")}
            </button>
          </div>
        </div>
        <div id="local-insights-body" className="local-insights-body" data-open={insightsOpen}>
        <div className="insight-metrics">
          <div><SearchX size={15} aria-hidden="true" /><span>{m("task.zeroResults")}</span><strong>{workspace.analytics.zeroResultSearches.length}</strong></div>
          <div><Clock3 size={15} aria-hidden="true" /><span>{m("task.foundToCopy")}</span><strong>{formatDuration(median, language)}</strong></div>
        </div>
        {workspace.analytics.zeroResultSearches.length > 0 && (
          <p>{m("task.recentPrefix")}{workspace.analytics.zeroResultSearches.slice(0, 3).map((item) => item.query).join("、")}</p>
        )}
        <button className="button button-ai personal-assistant-button" type="button" disabled={aiWorking !== null} onClick={() => void askPersonalAssistant()}>
          <BrainCircuit size={15} /> {aiWorking === "personal" ? m("task.analyzing") : m("task.analyzeUsage")}
        </button>
        <small className="ai-data-disclosure">{m("task.dataDisclosure")}</small>
        </div>
      </aside>

      {task.trim() && (submitted || aiRecommendation) && (
        <MarketplaceCandidateZone
          key={task.trim()}
          task={task}
          installedSkillNames={skills.map((skill) => skill.name)}
        />
      )}

      {aiError && <p className="ai-inline-error">{aiError}</p>}

      {aiRecommendation && (
        <AiRecommendationCard result={aiRecommendation.result} provider={providerLabel(aiRecommendation.provider)} skills={aiResultSkills} selectedIds={selectedIds} onSelect={onSelect} onToggle={toggleSelected} />
      )}

      {composition && (
        <article className="ai-advisory-card ai-composition-card">
          <header><span><Workflow size={16} /> {m("task.compositionTitle")}</span><small>{providerLabel(composition.provider)} · {m("task.advisoryOnly")}</small></header>
          <h3>{composition.result.title}</h3>
          <p>{composition.result.rationale}</p>
          <ol>{composition.result.steps.map((step) => <li key={step.skillName}><strong>${step.skillName}</strong><span>{step.goal}</span><small>{m("task.handoff")}{step.handoff}</small></li>)}</ol>
          <div className="ai-prompt-preview"><pre>{composition.result.combinedPrompt}</pre><button className="button button-primary" type="button" onClick={() => void copyCombinedPrompt(composition.result)}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? m("task.copied") : m("task.copyCombined")}</button></div>
        </article>
      )}

      {personalAdvice && <PersonalAdviceCard result={personalAdvice.result} provider={providerLabel(personalAdvice.provider)} onSelect={(name) => { const skill = byName.get(name); if (skill) onSelect(skill); }} />}
    </section>
  );
}

function AiRecommendationCard({ result, provider, skills, selectedIds, onSelect, onToggle }: {
  result: TaskRecommendationResult;
  provider: string;
  skills: Array<TaskRecommendationResult["recommendations"][number] & { skill: SkillSummary }>;
  selectedIds: string[];
  onSelect: (skill: SkillSummary) => void;
  onToggle: (skillId: string) => void;
}) {
  const { m } = useLanguage();
  return <article className="ai-advisory-card ai-task-card">
    <header><span><WandSparkles size={16} /> {m("task.aiDeepMatch")}</span><small>{provider} · {m("market.generatedOnDemand")}</small></header>
    <p>{result.summary}</p>
    <div className="ai-skill-suggestions">{skills.map((item) => <div key={item.skill.id} data-selected={selectedIds.includes(item.skill.id)}><button type="button" onClick={() => onSelect(item.skill)}><strong>{item.skill.displayName}</strong><code>${item.skill.name}</code><span>{item.reason}</span></button><label><input type="checkbox" checked={selectedIds.includes(item.skill.id)} onChange={() => onToggle(item.skill.id)} /> {m("task.addToFlow")}</label></div>)}</div>
    <small className="ai-next-step">{result.nextStep}</small>
  </article>;
}

function PersonalAdviceCard({ result, provider, onSelect }: { result: PersonalAssistantResult; provider: string; onSelect: (name: string) => void }) {
  const { m } = useLanguage();
  return <article className="ai-advisory-card ai-personal-card">
    <header><span><BrainCircuit size={16} /> {m("task.personalAdvice")}</span><small>{provider} · {m("task.noNoteBodiesSent")}</small></header>
    <p>{result.summary}</p>
    {result.habits.length > 0 && <ul>{result.habits.map((habit) => <li key={habit}>{habit}</li>)}</ul>}
    <div className="ai-personal-suggestions">{result.suggestions.map((suggestion) => <button key={suggestion.skillName} type="button" onClick={() => onSelect(suggestion.skillName)}><strong>${suggestion.skillName}</strong><span>{suggestion.reason}</span><small>{suggestion.exampleTask}</small></button>)}</div>
  </article>;
}
