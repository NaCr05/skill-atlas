"use client";

import { ArrowRight, Clock3, SearchX, Sparkles } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { medianCopyJourneyMs, recordZeroResultSearch, type LocalWorkspaceState } from "@/core/local-workspace";
import { recommendSkills } from "@/core/skills/recommend";
import type { SkillRecord } from "@/core/skills/types";
import { useLanguage } from "./language-provider";

function formatDuration(milliseconds: number | undefined, language: "zh" | "en"): string {
  if (milliseconds === undefined) return language === "zh" ? "暂无数据" : "No data yet";
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return language === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return language === "zh" ? `${minutes} 分 ${remainder} 秒` : `${minutes}m ${remainder}s`;
}

export function TaskRecommender({
  skills,
  workspace,
  onSelect,
  onClear,
}: {
  skills: SkillRecord[];
  workspace: LocalWorkspaceState;
  onSelect: (skill: SkillRecord) => void;
  onClear: () => void;
}) {
  const { language, t } = useLanguage();
  const [task, setTask] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const median = useMemo(() => medianCopyJourneyMs(workspace), [workspace]);
  const recommendations = useMemo(
    () => submitted ? recommendSkills(skills, task, language) : [],
    [language, skills, submitted, task],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = recommendSkills(skills, task, language);
    setSubmitted(true);
    if (task.trim() && !next.length) recordZeroResultSearch(task, "task-recommendation");
  }

  return (
    <section className="task-finder" aria-labelledby="task-finder-title">
      <div className="task-finder-main">
        <div className="task-finder-heading">
          <span><Sparkles size={16} aria-hidden="true" /> {t("按任务找技能", "Find by task")}</span>
          <small>{t("描述你想完成的事情，由本地规则推荐已安装技能", "Describe the outcome; local rules recommend installed Skills")}</small>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="task-description" className="sr-only">{t("任务描述", "Task description")}</label>
          <textarea
            id="task-description"
            value={task}
            onChange={(event) => {
              setTask(event.target.value);
              setSubmitted(false);
            }}
            placeholder={t("例如：我想检查现有 React 页面并改善移动端视觉和可访问性。", "For example: Review an existing React page and improve its mobile visual quality and accessibility.")}
            rows={2}
          />
          <button className="button button-primary" type="submit" disabled={!task.trim()}>
            {t("推荐技能", "Recommend Skills")} <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
        {recommendations.length > 0 && (
          <div className="task-recommendations" aria-label={t("推荐结果", "Recommendations")}>
            {recommendations.map((recommendation) => (
              <button key={recommendation.skill.id} type="button" onClick={() => onSelect(recommendation.skill)}>
                <strong>{recommendation.skill.displayName}</strong>
                <code>${recommendation.skill.name}</code>
                <small>{recommendation.reasons.length ? recommendation.reasons.join(" · ") : t("任务关键词匹配", "Task keyword match")}</small>
              </button>
            ))}
          </div>
        )}
        {submitted && task.trim() && recommendations.length === 0 && (
          <p className="task-no-result"><SearchX size={15} aria-hidden="true" /> {t("暂时没有高置信度匹配，已记录到本机的零结果统计。", "No high-confidence match. This was added to local zero-result statistics.")}</p>
        )}
      </div>

      <aside className="local-insights" aria-label={t("本地使用洞察", "Local usage insights")}>
        <div className="local-insights-heading">
          <span>{t("本地使用洞察", "Local usage insights")}</span>
          <div>
            <small>{t("仅保存在当前浏览器", "Stored only in this browser")}</small>
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
      </aside>
    </section>
  );
}
