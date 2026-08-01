"use client";

import { statusLabel } from "@/core/i18n";
import type { SkillStatus } from "@/core/skills/types";
import { useLanguage } from "./language-provider";

export function StatusBadge({ status }: { status: SkillStatus }) {
  const { language } = useLanguage();
  return (
    <span className="status-badge" data-status={status}>
      <span aria-hidden="true" />
      {statusLabel(status, language)}
    </span>
  );
}
