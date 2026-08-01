import type { Language } from "@/core/i18n";
import type { SkillRecord } from "./types";

export interface PromptResult {
  prompt: string;
  source: "skill-default" | "dashboard-template" | "ai-enhanced";
  notice?: string;
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
): Promise<PromptResult> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    return {
      ...base,
      notice: language === "zh"
        ? "未配置 OPENAI_API_KEY 和 OPENAI_MODEL，已保留本地确定性模板。"
        : "OPENAI_API_KEY and OPENAI_MODEL are not configured, so the deterministic local template was kept.",
    };
  }

  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: language === "zh"
        ? "用中文改写给定的 Codex 技能调用提示词。保留完全一致的 $skill-name 触发词，不添加未经提供的事实，只返回改写后的中文提示词。"
        : "Rewrite the supplied Codex skill invocation prompt in English. Preserve the exact $skill-name trigger, do not add facts, and return only the improved prompt.",
      input: language === "zh"
        ? `技能：${skill.name}\n说明：${skill.description}\n原始提示词：\n${base.prompt}`
        : `Skill: ${skill.name}\nDescription: ${skill.description}\nPrompt:\n${base.prompt}`,
      max_output_tokens: 500,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return {
      ...base,
      notice: language === "zh"
        ? `AI 增强暂不可用（HTTP ${response.status}），已保留本地模板。`
        : `AI enhancement is unavailable (HTTP ${response.status}); the local template was kept.`,
    };
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  const output =
    payload.output_text?.trim() ||
    payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text?.trim())
      .filter(Boolean)
      .join("\n");
  if (!output || !output.includes(`$${skill.name}`) || (language === "zh" && !/\p{Script=Han}/u.test(output))) {
    return {
      ...base,
      notice: language === "zh"
        ? "AI 返回结果不符合调用约束，已保留本地模板。"
        : "The AI response did not satisfy the invocation constraints, so the local template was kept.",
    };
  }

  return { prompt: output, source: "ai-enhanced" };
}
