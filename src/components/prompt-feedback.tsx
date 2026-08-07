"use client";

import { BadgeCheck, CircleX, LocateOff } from "lucide-react";

import type { PromptFeedbackOutcome } from "@/core/personal-library";

import { useLanguage } from "./language-provider";

const outcomes: Array<{ value: PromptFeedbackOutcome; zh: string; en: string; icon: typeof BadgeCheck }> = [
  { value: "helpful", zh: "有帮助", en: "Helpful", icon: BadgeCheck },
  { value: "not-solved", zh: "没解决", en: "Not solved", icon: CircleX },
  { value: "wrong-skill", zh: "选错 Skill", en: "Wrong Skill", icon: LocateOff },
];

export function PromptFeedback({
  value,
  onChange,
}: {
  value?: PromptFeedbackOutcome;
  onChange: (outcome: PromptFeedbackOutcome) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="prompt-feedback" role="group" aria-label={t("这次调用提示词是否有效", "Was this invocation Prompt effective?")}>
      <span>{t("这次结果如何？", "How did it go?")}</span>
      <div>
        {outcomes.map(({ value: outcome, zh, en, icon: Icon }) => (
          <button key={outcome} type="button" aria-pressed={value === outcome} data-active={value === outcome} onClick={() => onChange(outcome)}>
            <Icon size={12} aria-hidden="true" />{t(zh, en)}
          </button>
        ))}
      </div>
      <small>{t("只保存 Skill 标识和结果，不保存或上传对话正文。", "Only the Skill ID and outcome stay locally; conversation text is never stored or uploaded.")}</small>
    </div>
  );
}
