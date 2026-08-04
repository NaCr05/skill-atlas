import type { Language } from "@/core/i18n";
import { aiProviderLabel, resolveAiProviderConfig, type AiProvider, type AiProviderConfig } from "@/core/ai/provider-config";
import type { SkillRecord } from "./types";

export interface PromptResult {
  prompt: string;
  source: "skill-default" | "dashboard-template" | "ai-enhanced";
  provider?: AiProvider;
  notice?: string;
}

const ENHANCEMENT_INSTRUCTION: Record<Language, string> = {
  zh: "用中文改写给定的 Codex 技能调用提示词。保留完全一致的 $skill-name 触发词，不添加未经提供的事实，只返回改写后的中文提示词。",
  en: "Rewrite the supplied Codex skill invocation prompt in English. Preserve the exact $skill-name trigger, do not add facts, and return only the improved prompt.",
};

function enhancementInput(
  skill: Pick<SkillRecord, "name" | "description">,
  base: PromptResult,
  language: Language,
): string {
  return language === "zh"
    ? `技能：${skill.name}\n说明：${skill.description}\n原始提示词：\n${base.prompt}`
    : `Skill: ${skill.name}\nDescription: ${skill.description}\nPrompt:\n${base.prompt}`;
}

function fallbackNotice(provider: AiProvider, reason: string, language: Language): string {
  const label = aiProviderLabel(provider);
  return language === "zh"
    ? `${label} 增强${reason}，已保留本地模板。`
    : `${label} enhancement ${reason}; the local template was kept.`;
}

function validEnhancedOutput(
  output: string | undefined,
  skillName: string,
  language: Language,
): output is string {
  return Boolean(
    output
    && output.includes(`$${skillName}`)
    && (language !== "zh" || /\p{Script=Han}/u.test(output)),
  );
}

async function requestOpenAiEnhancement(
  apiKey: string,
  model: string,
  base: PromptResult,
  skill: Pick<SkillRecord, "name" | "description">,
  fetcher: typeof fetch,
  language: Language,
): Promise<Response> {
  return fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: ENHANCEMENT_INSTRUCTION[language],
      input: enhancementInput(skill, base, language),
      max_output_tokens: 500,
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

async function requestDeepSeekEnhancement(
  apiKey: string,
  model: string,
  base: PromptResult,
  skill: Pick<SkillRecord, "name" | "description">,
  fetcher: typeof fetch,
  language: Language,
): Promise<Response> {
  return fetcher("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: ENHANCEMENT_INSTRUCTION[language] },
        { role: "user", content: enhancementInput(skill, base, language) },
      ],
      thinking: { type: "disabled" },
      max_tokens: 500,
      stream: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

async function readOpenAiOutput(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  return payload.output_text?.trim() || payload.output
    ?.filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n");
}

async function readDeepSeekOutput(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return payload.choices?.[0]?.message?.content?.trim() || undefined;
}

export function createInvocationPrompt(
  skill: Pick<SkillRecord, "name" | "description" | "defaultPrompt">,
  task?: string,
  language: Language = "zh",
): PromptResult {
  const cleanTask = task?.trim();

  if (language === "en" && !cleanTask && skill.defaultPrompt) {
    return { prompt: skill.defaultPrompt, source: "skill-default" };
  }

  if (language === "zh") {
    const taskSection = cleanTask
      ? `任务目标：\n${cleanTask}`
      : "任务目标：\n请先询问我希望完成的具体任务、已有输入材料和期望输出。";
    return {
      prompt: `$${skill.name}\n\n请使用 ${skill.name} 技能协助我完成以下任务。\n\n${taskSection}\n\n执行要求：\n1. 阅读并遵循该技能的说明和全部配套文件。\n2. 开始前简要说明你将如何应用该技能。\n3. 如果缺少关键信息，只提出最少量的澄清问题。\n4. 完成后说明产出内容、验证结果和仍需注意的风险。`,
      source: "dashboard-template",
    };
  }

  const taskLine = cleanTask
    ? cleanTask
    : `Use ${skill.name} to help me complete the following task. Before starting, briefly explain how you will apply this Skill. If essential information is missing, ask the minimum number of questions.`;

  return {
    prompt: `$${skill.name}\n\n${taskLine}`,
    source: "dashboard-template",
  };
}

export async function enhanceInvocationPrompt(
  base: PromptResult,
  skill: Pick<SkillRecord, "name" | "description">,
  fetcher: typeof fetch = fetch,
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
  language: Language = "zh",
  configuredProvider?: AiProviderConfig,
): Promise<PromptResult> {
  const config = configuredProvider || resolveAiProviderConfig(env);
  if (config.selection === "invalid") {
    return {
      ...base,
      notice: language === "zh"
        ? `AI_PROVIDER=${config.requestedValue} 无效，应为 auto、openai 或 deepseek；已保留本地模板。`
        : `AI_PROVIDER=${config.requestedValue} is invalid; use auto, openai, or deepseek. The local template was kept.`,
    };
  }
  if (!config.provider || !config.configured || !config.apiKey || !config.model) {
    return {
      ...base,
      notice: language === "zh"
        ? config.provider
          ? `${aiProviderLabel(config.provider)} 配置不完整，缺少 ${config.missingVariables.join("、")}；已保留本地模板。`
          : "未配置 AI 提供商，已保留本地确定性模板。"
        : config.provider
          ? `${aiProviderLabel(config.provider)} is missing ${config.missingVariables.join(", ")}; the local template was kept.`
          : "No AI provider is configured, so the deterministic local template was kept.",
    };
  }
  const provider = config.provider;
  let response: Response;
  try {
    response = provider === "openai"
      ? await requestOpenAiEnhancement(config.apiKey, config.model, base, skill, fetcher, language)
      : await requestDeepSeekEnhancement(config.apiKey, config.model, base, skill, fetcher, language);
  } catch {
    return { ...base, notice: fallbackNotice(provider, language === "zh" ? "请求失败" : "request failed", language) };
  }
  if (!response.ok) {
    return {
      ...base,
      notice: fallbackNotice(provider, language === "zh" ? `暂不可用（HTTP ${response.status}）` : `is unavailable (HTTP ${response.status})`, language),
    };
  }

  let output: string | undefined;
  try {
    output = provider === "openai"
      ? await readOpenAiOutput(response)
      : await readDeepSeekOutput(response);
  } catch {
    return { ...base, notice: fallbackNotice(provider, language === "zh" ? "返回无法解析" : "returned an unreadable response", language) };
  }
  if (!validEnhancedOutput(output, skill.name, language)) {
    return {
      ...base,
      notice: language === "zh"
        ? `${aiProviderLabel(provider)} 返回结果不符合调用约束，已保留本地模板。`
        : `The ${aiProviderLabel(provider)} response did not satisfy the invocation constraints, so the local template was kept.`,
    };
  }

  return { prompt: output, source: "ai-enhanced", provider };
}
