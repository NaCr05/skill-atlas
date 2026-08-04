import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { enableDisabledSkill } from "@/core/lifecycle/skill-state";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";
const inputSchema = z.object({ disabledId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { disabledId } = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "enable", target: disabledId, recoveryHref: "/trash", work: () => enableDisabledSkill(disabledId), describe: (value) => `${value.skillName} re-enabled` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "ENABLE_FAILED");
  }
}
