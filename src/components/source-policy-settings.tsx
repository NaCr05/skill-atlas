"use client";

import { Save, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { SourcePolicy } from "@/core/source-policy/source-policy";
import { useLanguage } from "./language-provider";

const lines = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

export function SourcePolicySettings({ initialPolicy }: { initialPolicy: SourcePolicy }) {
  const { language, t } = useLanguage();
  const [policy, setPolicy] = useState(initialPolicy);
  const [owners, setOwners] = useState(initialPolicy.trustedOwners.join("\n"));
  const [repositories, setRepositories] = useState(initialPolicy.trustedRepositories.join("\n"));
  const [licenses, setLicenses] = useState(initialPolicy.allowedLicenses.join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();

  async function save() {
    setSaving(true); setMessage(undefined);
    try {
      const response = await fetch("/api/settings/source-policy", { method: "PUT", headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language }, body: JSON.stringify({ ...policy, trustedOwners: lines(owners), trustedRepositories: lines(repositories), allowedLicenses: lines(licenses) }) });
      const payload = await response.json() as SourcePolicy & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("保存失败。", "Save failed."));
      setPolicy(payload); setMessage({ kind: "success", text: t("来源策略已保存；下一次安装审查立即生效。", "Source policy saved; the next installation review uses it immediately.") });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setSaving(false); }
  }

  return <section className="source-policy-settings">
    <header><div><span className="eyebrow">{t("来源治理", "SOURCE GOVERNANCE")}</span><h2><ShieldCheck size={20} /> {t("作者、仓库与许可证策略", "Author, repository & license policy")}</h2><p>{t("策略只在你发起安装审查时执行；严格模式会把不匹配来源标记为阻断。", "Policies are evaluated only when you start an installation review. Strict modes block non-matching sources.")}</p></div></header>
    <div className="source-policy-grid"><label><span>{t("可信作者（每行一个 GitHub owner）", "Trusted authors (one GitHub owner per line)")}</span><textarea value={owners} onChange={(event) => setOwners(event.target.value)} placeholder="openai&#10;microsoft" /></label><label><span>{t("可信仓库（owner/repo）", "Trusted repositories (owner/repo)")}</span><textarea value={repositories} onChange={(event) => setRepositories(event.target.value)} placeholder="openai/skills" /></label><label><span>{t("允许的 SPDX 许可证", "Allowed SPDX licenses")}</span><textarea value={licenses} onChange={(event) => setLicenses(event.target.value)} /></label></div>
    <div className="source-policy-controls"><label><span>{t("信任名单", "Trust list")}</span><select value={policy.trustMode} onChange={(event) => setPolicy((current) => ({ ...current, trustMode: event.target.value as SourcePolicy["trustMode"] }))}><option value="advisory">{t("仅警告", "Advisory")}</option><option value="require">{t("不在名单则阻断", "Require match")}</option></select></label><label><span>{t("许可证", "Licenses")}</span><select value={policy.licenseMode} onChange={(event) => setPolicy((current) => ({ ...current, licenseMode: event.target.value as SourcePolicy["licenseMode"] }))}><option value="advisory">{t("仅提示", "Advisory")}</option><option value="allow-list">{t("仅允许名单", "Allowlist only")}</option></select></label><label className="policy-checkbox"><input type="checkbox" checked={policy.warnArchived} onChange={(event) => setPolicy((current) => ({ ...current, warnArchived: event.target.checked }))} />{t("警告归档仓库", "Warn about archived repositories")}</label></div>
    {message && <p className={message.kind === "error" ? "inline-error" : "inline-notice"}>{message.text}</p>}
    <footer><button className="button button-primary" type="button" disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? t("正在保存…", "Saving…") : t("保存来源策略", "Save source policy")}</button></footer>
  </section>;
}
