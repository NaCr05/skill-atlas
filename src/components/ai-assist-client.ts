import type {
  AiAssistAction,
  AiAssistInput,
  AiAssistResponse,
} from "@/core/ai/assist-contract";
import type { Language } from "@/core/i18n";

export class AiAssistRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AiAssistRequestError";
  }
}

export async function requestAiAssist<A extends AiAssistAction>(
  input: Extract<AiAssistInput, { action: A }>,
  options?: { signal?: AbortSignal },
): Promise<AiAssistResponse<A>> {
  const response = await fetch("/api/ai/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: options?.signal,
  });
  const payload = await response.json() as AiAssistResponse<A> & { error?: string };
  if (!response.ok) throw new AiAssistRequestError(payload.error || "AI_PROVIDER_FAILED");
  return payload;
}

export function aiAssistErrorText(error: unknown, language: Language): string {
  const code = error instanceof AiAssistRequestError ? error.code : "AI_PROVIDER_FAILED";
  const zh: Record<string, string> = {
    AI_NOT_CONFIGURED: "尚未配置 AI 提供商，请先前往环境设置保存 API Key。",
    AI_INPUT_INVALID: "提交给 AI 的内容无效或已经过期，请刷新后重试。",
    AI_PROVIDER_FAILED: "AI 提供商暂时无法完成请求，本地功能和确定性检查不受影响。",
    AI_INVALID_RESPONSE: "AI 返回的内容未通过格式与安全校验，请稍后重试。",
  };
  const en: Record<string, string> = {
    AI_NOT_CONFIGURED: "No AI provider is configured. Save an API key in Environment Settings first.",
    AI_INPUT_INVALID: "The AI input is invalid or stale. Refresh and try again.",
    AI_PROVIDER_FAILED: "The AI provider could not complete the request. Local features and deterministic checks are unaffected.",
    AI_INVALID_RESPONSE: "The AI response failed format or safety validation. Try again later.",
  };
  return (language === "zh" ? zh : en)[code] || (language === "zh" ? "AI 请求失败。" : "AI request failed.");
}
