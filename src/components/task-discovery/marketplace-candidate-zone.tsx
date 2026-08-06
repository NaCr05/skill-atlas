"use client";

import {
  ArrowRight,
  ArrowUpRight,
  SearchX,
  Store,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  AiAssistResponse,
  MarketCandidateRankingResult,
} from "@/core/ai/assist-contract";
import { localizeGeneratedText, localizeMarketplaceNotice } from "@/core/i18n";
import type { InstallationResult, InstallationReview as Review } from "@/core/installer/types";
import type { MarketplaceResponse, MarketplaceSkill } from "@/core/marketplaces/adapter";
import { selectMarketCandidates } from "@/core/marketplaces/candidates";
import { translatedMarketplaceDescription } from "@/core/skill-translations";
import { aiAssistErrorText, requestAiAssist } from "../ai-assist-client";
import { InstallationReview } from "../installation-review";
import { InstallationSuccess } from "../installation-success";
import { useLanguage } from "../language-provider";
import { isAbortedRequest, useLatestRequests } from "../use-latest-request";

/**
 * Owns the complete optional marketplace extension flow: grounded search,
 * on-demand AI ranking, install-source inspection, and reviewed installation.
 * The catalog only needs to provide the current task and installed names.
 */
export function MarketplaceCandidateZone({
  task,
  installedSkillNames,
}: {
  task: string;
  installedSkillNames: string[];
}) {
  const { language, m } = useLanguage();
  const requests = useLatestRequests();
  const [candidates, setCandidates] = useState<MarketplaceSkill[]>([]);
  const [responses, setResponses] = useState<MarketplaceResponse[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [ranking, setRanking] = useState<AiAssistResponse<"market-candidate-ranking"> | null>(null);
  const [rankingWorking, setRankingWorking] = useState(false);
  const [error, setError] = useState("");
  const [installReview, setInstallReview] = useState<Review | null>(null);
  const [inspectingCandidateId, setInspectingCandidateId] = useState("");
  const [installError, setInstallError] = useState("");
  const [installed, setInstalled] = useState<InstallationResult | null>(null);
  const [installedDescription, setInstalledDescription] = useState("");

  const displayedCandidates = useMemo(() => {
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    return ranking
      ? ranking.result.recommendations.flatMap((recommendation) => {
        const candidate = byId.get(recommendation.candidateId);
        return candidate ? [{ candidate, recommendation }] : [];
      })
      : candidates.map((candidate) => ({ candidate, recommendation: undefined }));
  }, [candidates, ranking]);

  async function search() {
    const request = requests.start("task-market");
    const taskSnapshot = task.trim();
    setSearching(true);
    setError("");
    setRanking(null);
    try {
      const [skillsMpResponse, skillsShResponse] = await Promise.all([
        fetch(`/api/marketplace/skillsmp?q=${encodeURIComponent(taskSnapshot)}`, { cache: "no-store", signal: request.signal }),
        fetch("/api/marketplace/skills-sh?view=trending", { cache: "no-store", signal: request.signal }),
      ]);
      const nextResponses = await Promise.all([
        skillsMpResponse.json() as Promise<MarketplaceResponse>,
        skillsShResponse.json() as Promise<MarketplaceResponse>,
      ]);
      if (!request.isCurrent()) return;
      setResponses(nextResponses);
      setCandidates(selectMarketCandidates(nextResponses, installedSkillNames, taskSnapshot));
      setSearched(true);
    } catch (cause) {
      if (request.isCurrent() && !isAbortedRequest(cause)) {
        setResponses([]);
        setCandidates([]);
        setSearched(true);
        setError(m("market.unavailable"));
      }
    } finally {
      if (request.isCurrent()) setSearching(false);
      request.finish();
    }
  }

  async function rank() {
    const request = requests.start("task-market-ranking");
    setRankingWorking(true);
    setError("");
    try {
      const result = await requestAiAssist({
        action: "market-candidate-ranking",
        language,
        task: task.trim(),
        candidates: candidates.slice(0, 20).map(({ id, name, description, author, sourceLabel, sourceUrl, pageUrl, installs, stars }) => ({
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
      if (request.isCurrent()) setRanking(result);
    } catch (cause) {
      if (request.isCurrent() && !isAbortedRequest(cause)) setError(aiAssistErrorText(cause, language));
    } finally {
      if (request.isCurrent()) setRankingWorking(false);
      request.finish();
    }
  }

  async function inspect(candidate: MarketplaceSkill) {
    if (!candidate.sourceUrl?.startsWith("https://github.com/")) {
      setInstallError(m("market.githubMissingReview"));
      return;
    }
    const request = requests.start("install-review");
    setInspectingCandidateId(candidate.id);
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
      if (!response.ok) throw new Error(payload.error || m("market.inspectFailed"));
      if (request.isCurrent()) {
        setInstalledDescription(candidate.description);
        setInstallReview(payload);
      }
    } catch (cause) {
      if (request.isCurrent() && !isAbortedRequest(cause)) {
        setInstallError(cause instanceof Error ? cause.message : m("market.inspectFailed"));
      }
    } finally {
      if (request.isCurrent()) setInspectingCandidateId("");
      request.finish();
    }
  }

  return (
    <>
      <section className="market-candidate-zone" aria-labelledby="market-candidate-title">
        <div className="market-candidate-entry">
          <div>
            <span className="market-zone-kicker"><Store size={15} /> {m("market.extendCapabilities")}</span>
            <strong id="market-candidate-title">{m("market.exploreTitle")}</strong>
            <small>{m("market.exploreDescription")}</small>
          </div>
          <button className="button button-market" type="button" disabled={searching} onClick={() => void search()}>
            <Store size={15} /> {searching ? m("market.searching") : searched ? m("market.searchAgain") : m("market.searchCandidates")}
          </button>
        </div>

        {error && <p className="market-inline-error">{error}</p>}
        {installError && <p className="market-inline-error">{installError}</p>}
        {searched && responses.some((response) => response.notice) && (
          <div className="market-source-notices">
            {responses.filter((response) => response.notice).map((response) => (
              <small key={response.provider}><b>{response.provider}</b> · {localizeMarketplaceNotice(response.notice || "", language)}</small>
            ))}
          </div>
        )}

        {searched && candidates.length === 0 && !error && (
          <div className="market-candidate-empty">
            <SearchX size={18} />
            <div><strong>{m("market.emptyTitle")}</strong><small>{m("market.emptyDescription")}</small></div>
            <Link className="button button-quiet" href="/marketplace">{m("market.open")} <ArrowRight size={14} /></Link>
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div className="market-candidate-toolbar">
              <div><strong>{m("market.foundCount", { count: candidates.length })}</strong><small>{m("market.groundedHint")}</small></div>
              <button className="button button-ai" type="button" disabled={rankingWorking} onClick={() => void rank()}><WandSparkles size={15} /> {rankingWorking ? m("market.ranking") : m("market.rank")}</button>
            </div>

            {ranking && (
              <div className="market-ai-summary">
                <span><WandSparkles size={15} /> {providerLabel(ranking.provider)} · {m("market.generatedOnDemand")}</span>
                <p>{ranking.result.summary}</p>
                <small><b>{m("market.capabilityGap")}</b>{ranking.result.capabilityGap}</small>
              </div>
            )}

            <div className="market-candidate-grid">
              {displayedCandidates.map(({ candidate, recommendation }) => (
                <MarketCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  recommendation={recommendation}
                  inspecting={inspectingCandidateId === candidate.id}
                  onReview={inspect}
                />
              ))}
            </div>
            {ranking && <p className="market-next-step">{ranking.result.nextStep}</p>}
          </>
        )}
      </section>

      {installed && <InstallationSuccess result={installed} description={installedDescription} />}
      {installReview && <InstallationReview review={installReview} onClose={() => setInstallReview(null)} onInstalled={(result) => { setInstalled(result); setInstallReview(null); }} />}
    </>
  );
}

function providerLabel(provider: "openai" | "deepseek"): string {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}

function MarketCandidateCard({
  candidate,
  recommendation,
  inspecting,
  onReview,
}: {
  candidate: MarketplaceSkill;
  recommendation?: MarketCandidateRankingResult["recommendations"][number];
  inspecting: boolean;
  onReview: (candidate: MarketplaceSkill) => void;
}) {
  const { language, m } = useLanguage();
  const reviewable = candidate.sourceUrl?.startsWith("https://github.com/") === true;
  const description = language === "zh"
    ? translatedMarketplaceDescription(candidate.name, candidate.description)
    : localizeGeneratedText(candidate.description, language);
  return <article className="market-candidate-card" data-ai-ranked={Boolean(recommendation)}>
    <header>
      <span>{m("market.notInstalled")}</span>
      <small>{candidate.sourceLabel}</small>
    </header>
    <h3>{candidate.name}</h3>
    <p>{recommendation?.reason || description}</p>
    {recommendation?.complements.length ? <div className="market-complements"><span>{m("market.pairsWith")}</span>{recommendation.complements.map((name) => <code key={name}>${name}</code>)}</div> : null}
    <div className="market-candidate-meta">
      <span>{candidate.author || m("market.unknownAuthor")}</span>
      {candidate.stars !== undefined && <span>★ {candidate.stars.toLocaleString()}</span>}
      {candidate.installs !== undefined && <span>{m("market.installCount", { count: candidate.installs.toLocaleString() })}</span>}
      {recommendation && <span data-confidence={recommendation.confidence}>{recommendation.confidence.toLocaleUpperCase()}</span>}
    </div>
    <footer>
      <a className="button button-quiet" href={candidate.pageUrl} target="_blank" rel="noreferrer">{m("market.viewSource")} <ArrowUpRight size={14} /></a>
      {reviewable ? (
        <button className="button button-market" type="button" disabled={inspecting} onClick={() => onReview(candidate)}>
          {inspecting ? m("market.preparingReview") : m("market.reviewAndInstall")} <ArrowRight size={14} />
        </button>
      ) : (
        <button className="button button-market" type="button" disabled title={m("market.githubMissingTitle")}>{m("market.githubMissing")}</button>
      )}
    </footer>
  </article>;
}
