import type { Language } from "./i18n";

const MAX_RECIPES = 120;
const MAX_WORKFLOWS = 80;
const MAX_NAME_LENGTH = 100;
const MAX_TASK_LENGTH = 4_000;
const MAX_REQUIREMENTS_LENGTH = 4_000;
const MAX_WORKFLOW_SKILLS = 8;

export type PromptFeedbackOutcome = "helpful" | "not-solved" | "wrong-skill";

export interface PromptRecipe {
  id: string;
  name: string;
  skillId: string;
  skillName: string;
  task: string;
  requirements: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
}

export interface SkillWorkflow {
  id: string;
  name: string;
  skillNames: string[];
  task: string;
  requirements: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  useCount: number;
}

export interface SkillFeedbackSummary {
  helpful: number;
  notSolved: number;
  wrongSkill: number;
  lastOutcome?: PromptFeedbackOutcome;
  lastFeedbackAt?: string;
  lastCopyAt?: string;
}

export interface PersonalLibraryState {
  recipes: PromptRecipe[];
  workflows: SkillWorkflow[];
  feedback: Record<string, SkillFeedbackSummary>;
}

export interface PromptRecipeInput {
  id?: string;
  name: string;
  skillId: string;
  skillName: string;
  task: string;
  requirements?: string;
  language: Language;
}

export interface SkillWorkflowInput {
  id?: string;
  name: string;
  skillNames: string[];
  task: string;
  requirements?: string;
  language: Language;
}

export interface WorkflowPromptSkill {
  name: string;
  displayName: string;
  description: string;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, max) : "";
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function language(value: unknown): Language {
  return value === "en" ? "en" : "zh";
}

function uniqueSkillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, MAX_WORKFLOW_SKILLS);
}

function createId(prefix: "recipe" | "workflow"): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function emptyPersonalLibrary(): PersonalLibraryState {
  return { recipes: [], workflows: [], feedback: {} };
}

export function normalizePersonalLibrary(value: unknown): PersonalLibraryState {
  if (!value || typeof value !== "object") return emptyPersonalLibrary();
  const record = value as Record<string, unknown>;

  const recipes = Array.isArray(record.recipes) ? record.recipes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const recipe = item as Record<string, unknown>;
    const id = cleanText(recipe.id, 160);
    const name = cleanText(recipe.name, MAX_NAME_LENGTH);
    const skillId = cleanText(recipe.skillId, 240);
    const skillName = cleanText(recipe.skillName, 80);
    if (!id || !name || !skillId || !skillName || !validDate(recipe.createdAt) || !validDate(recipe.updatedAt)) return [];
    return [{
      id,
      name,
      skillId,
      skillName,
      task: cleanText(recipe.task, MAX_TASK_LENGTH),
      requirements: cleanText(recipe.requirements, MAX_REQUIREMENTS_LENGTH),
      language: language(recipe.language),
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
      lastUsedAt: validDate(recipe.lastUsedAt) ? recipe.lastUsedAt : undefined,
      useCount: nonNegativeInteger(recipe.useCount),
    } satisfies PromptRecipe];
  }).slice(0, MAX_RECIPES) : [];

  const workflows = Array.isArray(record.workflows) ? record.workflows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const workflow = item as Record<string, unknown>;
    const id = cleanText(workflow.id, 160);
    const name = cleanText(workflow.name, MAX_NAME_LENGTH);
    const skillNames = uniqueSkillNames(workflow.skillNames);
    if (!id || !name || skillNames.length < 2 || !validDate(workflow.createdAt) || !validDate(workflow.updatedAt)) return [];
    return [{
      id,
      name,
      skillNames,
      task: cleanText(workflow.task, MAX_TASK_LENGTH),
      requirements: cleanText(workflow.requirements, MAX_REQUIREMENTS_LENGTH),
      language: language(workflow.language),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      lastUsedAt: validDate(workflow.lastUsedAt) ? workflow.lastUsedAt : undefined,
      useCount: nonNegativeInteger(workflow.useCount),
    } satisfies SkillWorkflow];
  }).slice(0, MAX_WORKFLOWS) : [];

  const feedbackValue = record.feedback && typeof record.feedback === "object" ? record.feedback as Record<string, unknown> : {};
  const feedback = Object.fromEntries(Object.entries(feedbackValue).flatMap(([skillId, item]) => {
    if (!skillId.trim() || !item || typeof item !== "object") return [];
    const summary = item as Record<string, unknown>;
    const lastOutcome = ["helpful", "not-solved", "wrong-skill"].includes(String(summary.lastOutcome))
      ? summary.lastOutcome as PromptFeedbackOutcome
      : undefined;
    return [[skillId.slice(0, 240), {
      helpful: nonNegativeInteger(summary.helpful),
      notSolved: nonNegativeInteger(summary.notSolved),
      wrongSkill: nonNegativeInteger(summary.wrongSkill),
      lastOutcome,
      lastFeedbackAt: validDate(summary.lastFeedbackAt) ? summary.lastFeedbackAt : undefined,
      lastCopyAt: validDate(summary.lastCopyAt) ? summary.lastCopyAt : undefined,
    } satisfies SkillFeedbackSummary]];
  }));

  return { recipes, workflows, feedback };
}

export function savePromptRecipe(
  library: PersonalLibraryState,
  input: PromptRecipeInput,
  now = new Date(),
): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  const existing = input.id ? normalized.recipes.find((recipe) => recipe.id === input.id) : undefined;
  const timestamp = now.toISOString();
  const recipe: PromptRecipe = {
    id: existing?.id || createId("recipe"),
    name: cleanText(input.name, MAX_NAME_LENGTH) || cleanText(input.skillName, 80),
    skillId: cleanText(input.skillId, 240),
    skillName: cleanText(input.skillName, 80),
    task: cleanText(input.task, MAX_TASK_LENGTH),
    requirements: cleanText(input.requirements, MAX_REQUIREMENTS_LENGTH),
    language: language(input.language),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastUsedAt: existing?.lastUsedAt,
    useCount: existing?.useCount || 0,
  };
  if (!recipe.skillId || !recipe.skillName || !recipe.name) return normalized;
  return normalizePersonalLibrary({
    ...normalized,
    recipes: [recipe, ...normalized.recipes.filter((item) => item.id !== recipe.id)],
  });
}

export function removePromptRecipe(library: PersonalLibraryState, recipeId: string): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  return { ...normalized, recipes: normalized.recipes.filter((recipe) => recipe.id !== recipeId) };
}

export function markPromptRecipeUsed(library: PersonalLibraryState, recipeId: string, now = new Date()): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  return {
    ...normalized,
    recipes: normalized.recipes.map((recipe) => recipe.id === recipeId ? {
      ...recipe,
      lastUsedAt: now.toISOString(),
      useCount: recipe.useCount + 1,
    } : recipe),
  };
}

export function saveSkillWorkflow(
  library: PersonalLibraryState,
  input: SkillWorkflowInput,
  now = new Date(),
): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  const existing = input.id ? normalized.workflows.find((workflow) => workflow.id === input.id) : undefined;
  const timestamp = now.toISOString();
  const workflow: SkillWorkflow = {
    id: existing?.id || createId("workflow"),
    name: cleanText(input.name, MAX_NAME_LENGTH) || (language(input.language) === "zh" ? "未命名工作流" : "Untitled workflow"),
    skillNames: uniqueSkillNames(input.skillNames),
    task: cleanText(input.task, MAX_TASK_LENGTH),
    requirements: cleanText(input.requirements, MAX_REQUIREMENTS_LENGTH),
    language: language(input.language),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    lastUsedAt: existing?.lastUsedAt,
    useCount: existing?.useCount || 0,
  };
  if (workflow.skillNames.length < 2) return normalized;
  return normalizePersonalLibrary({
    ...normalized,
    workflows: [workflow, ...normalized.workflows.filter((item) => item.id !== workflow.id)],
  });
}

export function removeSkillWorkflow(library: PersonalLibraryState, workflowId: string): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  return { ...normalized, workflows: normalized.workflows.filter((workflow) => workflow.id !== workflowId) };
}

export function markSkillWorkflowUsed(library: PersonalLibraryState, workflowId: string, now = new Date()): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  return {
    ...normalized,
    workflows: normalized.workflows.map((workflow) => workflow.id === workflowId ? {
      ...workflow,
      lastUsedAt: now.toISOString(),
      useCount: workflow.useCount + 1,
    } : workflow),
  };
}

function outcomeField(outcome: PromptFeedbackOutcome): keyof Pick<SkillFeedbackSummary, "helpful" | "notSolved" | "wrongSkill"> {
  if (outcome === "not-solved") return "notSolved";
  if (outcome === "wrong-skill") return "wrongSkill";
  return "helpful";
}

export function recordSkillFeedback(
  library: PersonalLibraryState,
  skillId: string,
  outcome: PromptFeedbackOutcome,
  copyAt: string,
  now = new Date(),
): PersonalLibraryState {
  const normalized = normalizePersonalLibrary(library);
  const previous = normalized.feedback[skillId] || { helpful: 0, notSolved: 0, wrongSkill: 0 };
  const next = { ...previous };
  if (previous.lastCopyAt === copyAt && previous.lastOutcome) {
    const previousField = outcomeField(previous.lastOutcome);
    next[previousField] = Math.max(0, next[previousField] - 1);
  }
  const field = outcomeField(outcome);
  next[field] += 1;
  next.lastOutcome = outcome;
  next.lastFeedbackAt = now.toISOString();
  next.lastCopyAt = validDate(copyAt) ? copyAt : now.toISOString();
  return { ...normalized, feedback: { ...normalized.feedback, [skillId]: next } };
}

export function skillFeedbackScore(summary?: SkillFeedbackSummary): number {
  if (!summary) return 0;
  return Math.max(-18, Math.min(12, summary.helpful * 4 - summary.notSolved * 2 - summary.wrongSkill * 6));
}

export function taskWithRequirements(task: string, requirements: string, language: Language): string {
  const cleanTask = cleanText(task, MAX_TASK_LENGTH);
  const cleanRequirements = cleanText(requirements, MAX_REQUIREMENTS_LENGTH);
  if (!cleanRequirements) return cleanTask;
  const label = language === "zh" ? "自定义要求" : "Custom requirements";
  const separator = language === "zh" ? "：" : ":";
  return cleanTask ? `${cleanTask}\n\n${label}${separator}\n${cleanRequirements}` : `${label}${separator}\n${cleanRequirements}`;
}

export function createWorkflowPrompt(
  workflow: Pick<SkillWorkflow, "name" | "task" | "requirements" | "language">,
  skills: WorkflowPromptSkill[],
): string {
  const { language: promptLanguage } = workflow;
  const task = taskWithRequirements(workflow.task, workflow.requirements, promptLanguage);
  const triggers = skills.map((skill) => `$${skill.name}`).join(" ");
  const steps = skills.map((skill, index) => promptLanguage === "zh"
    ? `${index + 1}. $${skill.name}（${skill.displayName}）\n   本阶段用途：${skill.description}`
    : `${index + 1}. $${skill.name} (${skill.displayName})\n   Stage purpose: ${skill.description}`).join("\n");

  if (promptLanguage === "zh") {
    return `${triggers}\n\n请按以下有序 Skill 工作流协助我完成任务。Skill Atlas 只生成了这段提示词，没有自动执行任何 Skill。\n\n工作流：${workflow.name}\n总任务：\n${task || "请先询问我的具体目标、输入材料和期望输出。"}\n\n执行顺序：\n${steps}\n\n协作要求：\n1. 严格按顺序使用这些 Skill，每阶段开始前说明当前使用的 Skill。\n2. 将上一阶段的产出作为下一阶段的输入，并简要说明交接内容。\n3. 如果某个 Skill 不适用或缺少必要条件，先说明原因并等待我确认，不要擅自替换。\n4. 不要把这段工作流理解为自动授权；涉及安装、删除、发布或外部写入时仍需单独确认。\n5. 最后汇总各阶段产出、验证结果和仍需处理的风险。`;
  }

  return `${triggers}\n\nUse the following ordered Skill workflow to complete my task. Skill Atlas only generated this Prompt and did not execute any Skill.\n\nWorkflow: ${workflow.name}\nOverall task:\n${task || "First ask for my concrete goal, available inputs, and expected output."}\n\nExecution order:\n${steps}\n\nCollaboration rules:\n1. Use the Skills in this exact order and name the active Skill at the start of each stage.\n2. Pass each stage's output into the next stage and summarize the handoff.\n3. If a Skill is unsuitable or missing prerequisites, explain why and wait for confirmation instead of substituting it.\n4. This workflow is not automatic authorization; installation, deletion, publishing, or external writes still require separate confirmation.\n5. Finish with the outputs, verification results, and remaining risks from every stage.`;
}

export function mergePersonalLibraries(current: PersonalLibraryState, imported: PersonalLibraryState): PersonalLibraryState {
  const left = normalizePersonalLibrary(current);
  const right = normalizePersonalLibrary(imported);
  const recipes = [...right.recipes, ...left.recipes].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const workflows = [...right.workflows, ...left.workflows].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  const feedback = { ...left.feedback };
  for (const [skillId, summary] of Object.entries(right.feedback)) {
    const existing = feedback[skillId];
    feedback[skillId] = existing ? {
      helpful: Math.max(existing.helpful, summary.helpful),
      notSolved: Math.max(existing.notSolved, summary.notSolved),
      wrongSkill: Math.max(existing.wrongSkill, summary.wrongSkill),
      lastOutcome: summary.lastOutcome || existing.lastOutcome,
      lastFeedbackAt: summary.lastFeedbackAt || existing.lastFeedbackAt,
      lastCopyAt: summary.lastCopyAt || existing.lastCopyAt,
    } : summary;
  }
  return normalizePersonalLibrary({ recipes, workflows, feedback });
}
