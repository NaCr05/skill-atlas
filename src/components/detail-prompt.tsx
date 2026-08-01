"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

import type { SkillRecord } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { PromptDialog } from "./prompt-dialog";

export function DetailPrompt({ skill }: { skill: SkillRecord }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  return (
    <>
      <button className="button button-primary button-wide" onClick={() => setOpen(true)}>
        <Copy size={17} aria-hidden="true" />
        {t("复制调用提示词", "Copy invocation Prompt")}
      </button>
      {open && <PromptDialog skill={skill} onClose={() => setOpen(false)} />}
    </>
  );
}
