import { z } from "zod";

import type { AiProvider } from "./provider-config";

const languageSchema = z.enum(["zh", "en"]);
const skillIdSchema = z.string().min(1).max(80);
const riskSchema = z.object({
  level: z.enum(["info", "review", "blocked"]),
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().min(1).max(800),
}).strict();

export const taskRecommendationInputSchema = z.object({
  action: z.literal("task-recommendation"),
  language: languageSchema,
  task: z.string().trim().min(2).max(1_000),
}).strict();

export const skillCompositionInputSchema = z.object({
  action: z.literal("skill-composition"),
  language: languageSchema,
  task: z.string().trim().min(2).max(1_000),
  skillIds: z.array(skillIdSchema).min(2).max(8),
}).strict();

const marketCandidateSchema = z.object({
  id: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000),
  author: z.string().trim().max(160).optional(),
  sourceLabel: z.string().trim().min(1).max(80),
  sourceUrl: z.string().url().max(1_000).optional(),
  pageUrl: z.string().url().max(1_000),
  installs: z.number().int().min(0).optional(),
  stars: z.number().int().min(0).optional(),
}).strict();

export const marketCandidateRankingInputSchema = z.object({
  action: z.literal("market-candidate-ranking"),
  language: languageSchema,
  task: z.string().trim().min(2).max(1_000),
  candidates: z.array(marketCandidateSchema).min(1).max(20)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
}).strict();

export const installationExplanationInputSchema = z.object({
  action: z.literal("installation-explanation"),
  language: languageSchema,
  review: z.object({
    skillName: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2_000),
    repository: z.string().trim().min(1).max(240),
    ref: z.string().trim().min(1).max(160),
    sourceDirectory: z.string().trim().max(500),
    installAllowed: z.boolean(),
    fileCount: z.number().int().min(0).max(5_000),
    totalBytes: z.number().int().min(0).max(100 * 1024 * 1024),
    files: z.array(z.object({
      path: z.string().trim().min(1).max(500),
      size: z.number().int().min(0).max(100 * 1024 * 1024),
    }).strict()).max(120),
    filesTruncated: z.boolean(),
    risks: z.array(riskSchema).max(40),
  }).strict(),
}).strict();

export const updateSummaryInputSchema = z.object({
  action: z.literal("update-summary"),
  language: languageSchema,
  preview: z.object({
    skillName: z.string().trim().min(1).max(80),
    status: z.enum(["up-to-date", "update-available", "differences-found", "local-changes"]),
    localDiverged: z.boolean(),
    repository: z.string().trim().min(1).max(240),
    ref: z.string().trim().min(1).max(160),
    revision: z.string().trim().min(1).max(160),
    summary: z.object({
      added: z.number().int().min(0),
      modified: z.number().int().min(0),
      removed: z.number().int().min(0),
      unchanged: z.number().int().min(0),
    }).strict(),
    changes: z.array(z.object({
      path: z.string().trim().min(1).max(500),
      kind: z.enum(["added", "modified", "removed", "unchanged"]),
      localSize: z.number().int().min(0).optional(),
      upstreamSize: z.number().int().min(0).optional(),
    }).strict()).max(120),
    changesTruncated: z.boolean(),
    risks: z.array(riskSchema).max(40),
  }).strict(),
}).strict();

export const personalAssistantInputSchema = z.object({
  action: z.literal("personal-assistant"),
  language: languageSchema,
  workspace: z.object({
    favoriteSkillIds: z.array(skillIdSchema).max(40),
    pinnedSkillIds: z.array(skillIdSchema).max(40),
    recentSkillIds: z.array(skillIdSchema).max(20),
    zeroResultQueries: z.array(z.string().trim().min(1).max(160)).max(20),
    copyJourneyMedianMs: z.number().int().min(0).max(30 * 60_000).optional(),
  }).strict(),
}).strict();

export const aiAssistInputSchema = z.discriminatedUnion("action", [
  taskRecommendationInputSchema,
  skillCompositionInputSchema,
  marketCandidateRankingInputSchema,
  installationExplanationInputSchema,
  updateSummaryInputSchema,
  personalAssistantInputSchema,
]);

export type AiAssistInput = z.infer<typeof aiAssistInputSchema>;
export type AiAssistAction = AiAssistInput["action"];
export type TaskRecommendationInput = z.infer<typeof taskRecommendationInputSchema>;
export type SkillCompositionInput = z.infer<typeof skillCompositionInputSchema>;
export type MarketCandidateRankingInput = z.infer<typeof marketCandidateRankingInputSchema>;
export type InstallationExplanationInput = z.infer<typeof installationExplanationInputSchema>;
export type UpdateSummaryInput = z.infer<typeof updateSummaryInputSchema>;
export type PersonalAssistantInput = z.infer<typeof personalAssistantInputSchema>;

export const taskRecommendationResultSchema = z.object({
  summary: z.string().trim().min(1).max(1_200),
  recommendations: z.array(z.object({
    skillName: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(800),
    confidence: z.enum(["high", "medium", "low"]),
  }).strict()).min(1).max(5),
  nextStep: z.string().trim().min(1).max(800),
}).strict();

export const marketCandidateRankingResultSchema = z.object({
  summary: z.string().trim().min(1).max(1_500),
  recommendations: z.array(z.object({
    candidateId: z.string().trim().min(1).max(240),
    reason: z.string().trim().min(1).max(800),
    confidence: z.enum(["high", "medium", "low"]),
    complements: z.array(z.string().trim().min(1).max(80)).max(4),
  }).strict()).min(1).max(6),
  capabilityGap: z.string().trim().min(1).max(1_000),
  nextStep: z.string().trim().min(1).max(800),
}).strict();

const compositionModelResultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().trim().min(1).max(1_200),
  steps: z.array(z.object({
    skillName: z.string().trim().min(1).max(80),
    goal: z.string().trim().min(1).max(800),
    handoff: z.string().trim().min(1).max(800),
  }).strict()).min(2).max(8),
}).strict();

export const installationExplanationResultSchema = z.object({
  summary: z.string().trim().min(1).max(1_500),
  verdict: z.enum(["safe-to-consider", "review-carefully", "do-not-install"]),
  strengths: z.array(z.string().trim().min(1).max(600)).max(6),
  watchItems: z.array(z.string().trim().min(1).max(600)).max(8),
  questions: z.array(z.string().trim().min(1).max(600)).max(6),
}).strict();

export const updateSummaryResultSchema = z.object({
  summary: z.string().trim().min(1).max(1_500),
  impact: z.enum(["low", "medium", "high"]),
  changes: z.array(z.string().trim().min(1).max(700)).max(8),
  watchItems: z.array(z.string().trim().min(1).max(700)).max(8),
  recommendation: z.enum(["update", "review", "skip"]),
}).strict();

export const personalAssistantResultSchema = z.object({
  summary: z.string().trim().min(1).max(1_500),
  suggestions: z.array(z.object({
    skillName: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(700),
    exampleTask: z.string().trim().min(1).max(700),
  }).strict()).min(1).max(6),
  habits: z.array(z.string().trim().min(1).max(700)).max(6),
}).strict();

export type TaskRecommendationResult = z.infer<typeof taskRecommendationResultSchema>;
export type MarketCandidateRankingResult = z.infer<typeof marketCandidateRankingResultSchema>;
export type SkillCompositionModelResult = z.infer<typeof compositionModelResultSchema>;
export type SkillCompositionResult = SkillCompositionModelResult & { combinedPrompt: string };
export type InstallationExplanationResult = z.infer<typeof installationExplanationResultSchema>;
export type UpdateSummaryResult = z.infer<typeof updateSummaryResultSchema>;
export type PersonalAssistantResult = z.infer<typeof personalAssistantResultSchema>;

export interface AiAssistResultMap {
  "task-recommendation": TaskRecommendationResult;
  "skill-composition": SkillCompositionResult;
  "market-candidate-ranking": MarketCandidateRankingResult;
  "installation-explanation": InstallationExplanationResult;
  "update-summary": UpdateSummaryResult;
  "personal-assistant": PersonalAssistantResult;
}

export interface AiAssistResponse<A extends AiAssistAction = AiAssistAction> {
  action: A;
  provider: AiProvider;
  generatedAt: string;
  result: AiAssistResultMap[A];
}

export { compositionModelResultSchema };
