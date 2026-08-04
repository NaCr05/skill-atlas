"use client";

import { PauseCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SkillRecord } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { SkillDisableDialog } from "./skill-disable-dialog";
import { SkillRemovalDialog } from "./skill-removal-dialog";

export function SkillLifecycleActions({ skill }: { skill: SkillRecord }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [dialog, setDialog] = useState<"disable" | "trash" | null>(null);
  const manageable = skill.source.kind === "personal" && skill.source.permission === "manage";

  async function completed() {
    setDialog(null);
    router.push("/trash");
    router.refresh();
  }

  return (
    <section className="side-panel lifecycle-actions-panel">
      <h2><ShieldCheck size={17} /> {t("生命周期管理", "Lifecycle management")}</h2>
      {manageable ? <>
        <p>{t("暂时不用可选择“停用”；确认不再需要时再移入回收站。两种操作都会保留完整目录和指纹。", "Use Disable when you only want to pause a Skill; move it to trash when it is no longer needed. Both retain the complete directory and fingerprint.")}</p>
        <div className="lifecycle-action-stack">
          <button className="button button-primary button-wide" type="button" onClick={() => setDialog("disable")}><PauseCircle size={15} /> {t("停用 Skill", "Disable Skill")}</button>
          <button className="button button-danger-quiet button-wide" type="button" onClick={() => setDialog("trash")}><Trash2 size={15} /> {t("移到回收站", "Move to trash")}</button>
        </div>
      </> : <p>{t("这个 Skill 由系统、插件或兼容目录管理；Skill Atlas 保持只读。", "This Skill is managed by a system, plugin, or compatibility source and remains read-only in Skill Atlas.")}</p>}
      {dialog === "disable" && <SkillDisableDialog skillId={skill.id} onClose={() => setDialog(null)} onDisabled={completed} />}
      {dialog === "trash" && <SkillRemovalDialog skillId={skill.id} onClose={() => setDialog(null)} onRemoved={completed} />}
    </section>
  );
}
