import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { restoreTrashedSkill } from "@/core/lifecycle/skill-trash";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";

const inputSchema = z.object({ trashId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { trashId } = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "restore", target: trashId, recoveryHref: "/trash", work: () => restoreTrashedSkill(trashId), describe: (value) => `${value.skillName} restored` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "RESTORE_FAILED");
  }
}
