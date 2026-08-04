import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmSkillRemoval } from "@/core/lifecycle/skill-trash";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";

const inputSchema = z.object({ planId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { planId } = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "remove", target: planId, recoveryHref: "/trash", work: () => confirmSkillRemoval(planId), describe: (value) => `${value.skillName} moved to trash` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "REMOVAL_FAILED");
  }
}
