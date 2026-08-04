"use client";

import { Check, KeyRound, RotateCcw, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { AiProvider } from "@/core/ai/provider-config";
import type { AiSettingsSummary } from "@/core/ai/runtime-config";
import { BreakablePath } from "./breakable-path";
import { useLanguage } from "./language-provider";

type ValidSelection = "auto" | AiProvider;

const PROVIDERS: Array<{ id: AiProvider; name: string; keyVariable: string; modelVariable: string }> = [
  { id: "openai", name: "OpenAI", keyVariable: "OPENAI_API_KEY", modelVariable: "OPENAI_MODEL" },
  { id: "deepseek", name: "DeepSeek", keyVariable: "DEEPSEEK_API_KEY", modelVariable: "DEEPSEEK_MODEL" },
];

function providerName(provider?: AiProvider): string {
  return provider === "openai" ? "OpenAI" : provider === "deepseek" ? "DeepSeek" : "—";
}

export function AiProviderSettings({ initialSummary }: { initialSummary: AiSettingsSummary }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [selection, setSelection] = useState<ValidSelection>(initialSummary.selection === "invalid" ? "auto" : initialSummary.selection);
  const [models, setModels] = useState<Record<AiProvider, string>>({
    openai: initialSummary.providers.openai.model,
    deepseek: initialSummary.providers.deepseek.model || "deepseek-v4-flash",
  });
  const [apiKeys, setApiKeys] = useState<Record<AiProvider, string>>({ openai: "", deepseek: "" });
  const [clearKeys, setClearKeys] = useState<Record<AiProvider, boolean>>({ openai: false, deepseek: false });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function selectProvider(next: ValidSelection): void {
    setSelection(next);
    if (next === "deepseek" && !models.deepseek.trim()) {
      setModels((current) => ({ ...current, deepseek: "deepseek-v4-flash" }));
    }
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection,
          providers: Object.fromEntries(PROVIDERS.map(({ id }) => [id, {
            ...(apiKeys[id].trim() ? { apiKey: apiKeys[id].trim() } : {}),
            clearApiKey: clearKeys[id],
            model: models[id],
          }])),
        }),
      });
      const payload = await response.json() as AiSettingsSummary & { error?: string };
      if (!response.ok) throw new Error(payload.error || "AI_SETTINGS_SAVE_FAILED");
      setSummary(payload);
      setApiKeys({ openai: "", deepseek: "" });
      setClearKeys({ openai: false, deepseek: false });
      setMessage({ kind: "success", text: t("AI 连接已保存并立即生效。", "AI connection saved and active now.") });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: t("无法保存配置。请检查输入和本地环境后重试。", "Could not save the configuration. Check the fields and local environment, then try again.") });
    } finally {
      setWorking(false);
    }
  }

  async function restoreEnvironment(): Promise<void> {
    const confirmed = window.confirm(t(
      "这会删除通过页面保存的 AI 配置，并恢复使用环境变量。确定继续吗？",
      "This deletes AI settings saved through the page and restores environment-variable configuration. Continue?",
    ));
    if (!confirmed) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/ai", { method: "DELETE" });
      const payload = await response.json() as AiSettingsSummary & { error?: string };
      if (!response.ok) throw new Error(payload.error || "AI_SETTINGS_CLEAR_FAILED");
      setSummary(payload);
      const nextSelection = payload.selection === "invalid" ? "auto" : payload.selection;
      setSelection(nextSelection);
      setModels({ openai: payload.providers.openai.model, deepseek: payload.providers.deepseek.model || "deepseek-v4-flash" });
      setApiKeys({ openai: "", deepseek: "" });
      setClearKeys({ openai: false, deepseek: false });
      setMessage({ kind: "success", text: t("页面配置已清除，现已恢复环境变量。", "Saved page settings cleared; environment variables are active again.") });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: t("无法清除页面配置，请重试。", "Could not clear the saved page settings. Try again.") });
    } finally {
      setWorking(false);
    }
  }

  function keyStatus(provider: AiProvider): string {
    const providerSummary = summary.providers[provider];
    if (providerSummary.apiKeySource === "saved") return t("已加密保存", "Encrypted and saved");
    if (providerSummary.apiKeySource === "environment") return t("来自环境变量", "From environment");
    return t("尚未配置", "Not configured");
  }

  return (
    <section className="ai-config-panel" aria-labelledby="ai-config-title">
      <div className="ai-config-heading">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> {t("AI 连接配置台", "AI CONNECTION CONSOLE")}</span>
          <h2 id="ai-config-title">{t("在页面中接入 OpenAI 或 DeepSeek", "Connect OpenAI or DeepSeek here")}</h2>
          <p>{t("保存后立即用于 Prompt 个性化增强；不需要编辑脚本，也不需要重启服务。", "Saved settings take effect for Prompt personalization immediately—no script editing or restart required.")}</p>
        </div>
        <div className="ai-live-status" data-ready={summary.configured}>
          <span>{summary.configured ? <Check size={18} /> : <KeyRound size={18} />}</span>
          <div>
            <small>{t("当前提供商", "CURRENT PROVIDER")}</small>
            <strong>{providerName(summary.provider)}</strong>
            <em>{summary.configured ? t("连接就绪", "Connection ready") : t("本地模板模式", "Local template mode")}</em>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="ai-config-form">
        <fieldset className="provider-selector">
          <legend>{t("选择调用策略", "Choose routing")}</legend>
          {(["auto", "openai", "deepseek"] as const).map((provider) => (
            <label key={provider} data-active={selection === provider}>
              <input
                type="radio"
                name="ai-provider"
                value={provider}
                checked={selection === provider}
                onChange={() => selectProvider(provider)}
              />
              <span>{provider === "auto" ? "Auto" : providerName(provider)}</span>
              <small>{provider === "auto"
                ? t("优先 OpenAI，其次 DeepSeek", "OpenAI first, then DeepSeek")
                : t(`只调用 ${providerName(provider)}`, `Use ${providerName(provider)} only`)}</small>
            </label>
          ))}
        </fieldset>

        <div className="provider-credential-grid">
          {PROVIDERS.map((provider) => {
            const providerSummary = summary.providers[provider.id];
            return (
              <fieldset key={provider.id} className="provider-credential-card" data-provider={provider.id}>
                <legend>
                  <span>{provider.name}</span>
                  <b data-source={providerSummary.apiKeySource}>{keyStatus(provider.id)}</b>
                </legend>
                <label htmlFor={`${provider.id}-api-key`}>
                  <span>API Key</span>
                  <code>{provider.keyVariable}</code>
                </label>
                <input
                  id={`${provider.id}-api-key`}
                  type="password"
                  value={apiKeys[provider.id]}
                  onChange={(event) => {
                    setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }));
                    if (event.target.value) setClearKeys((current) => ({ ...current, [provider.id]: false }));
                  }}
                  placeholder={providerSummary.apiKeyConfigured
                    ? t("已配置；留空保持不变", "Configured; leave blank to keep it")
                    : t("粘贴密钥，保存后不会回显", "Paste a key; it will not be shown again")}
                  autoComplete="off"
                  spellCheck={false}
                />
                <label htmlFor={`${provider.id}-model`}>
                  <span>{t("模型", "Model")}</span>
                  <code>{provider.modelVariable}</code>
                </label>
                <input
                  id={`${provider.id}-model`}
                  value={models[provider.id]}
                  onChange={(event) => setModels((current) => ({ ...current, [provider.id]: event.target.value }))}
                  placeholder={provider.id === "deepseek" ? "deepseek-v4-flash" : t("填写你的 OpenAI 模型", "Enter your OpenAI model")}
                  autoComplete="off"
                  spellCheck={false}
                />
                {providerSummary.apiKeyConfigured ? (
                  <label className="clear-key-control">
                    <input
                      type="checkbox"
                      checked={clearKeys[provider.id]}
                      onChange={(event) => {
                        setClearKeys((current) => ({ ...current, [provider.id]: event.target.checked }));
                        if (event.target.checked) setApiKeys((current) => ({ ...current, [provider.id]: "" }));
                      }}
                    />
                    <Trash2 size={14} />
                    <span>{t("停用并清除此密钥", "Disable and clear this key")}</span>
                  </label>
                ) : null}
              </fieldset>
            );
          })}
        </div>

        <div className="ai-storage-note" data-issue={summary.storageIssue}>
          <ShieldCheck size={18} />
          <div>
            <strong>{summary.storageIssue
              ? t("本地凭据读取异常", "Local credential issue")
              : t("使用 Windows 当前用户加密", "Protected for the current Windows user")}</strong>
            <p>{t("API Key 只在保存时发送到本机服务，随后经 Windows DPAPI 加密；保存后不会回传，也不会进入 Skill 文件或 Git。", "The key is sent to the local service only when saved, then encrypted with Windows DPAPI. It is never returned afterward or written to Skill files or Git.")}</p>
            <BreakablePath value={summary.storagePath} />
          </div>
        </div>

        <div className="ai-config-actions">
          <div aria-live="polite">
            {message ? <p className={message.kind === "success" ? "inline-success" : "inline-error"}>{message.text}</p> : null}
          </div>
          {summary.hasSavedSettings ? (
            <button type="button" className="button button-quiet" onClick={restoreEnvironment} disabled={working}>
              <RotateCcw size={16} /> {t("恢复环境变量", "Restore environment settings")}
            </button>
          ) : null}
          <button type="submit" className="button button-primary" disabled={working}>
            <Save size={16} /> {working ? t("保存中…", "Saving…") : t("保存 AI 连接", "Save AI connection")}
          </button>
        </div>
      </form>
    </section>
  );
}
