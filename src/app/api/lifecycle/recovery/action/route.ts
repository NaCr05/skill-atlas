import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { executeRecoveryAction } from "@/core/lifecycle/recovery-actions";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";
const inputSchema = z.object({
  issueId: z.string().trim().min(1).max(1000),
  action: z.enum(["restore-quarantine", "clean-staging", "retry-transaction"]),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "recovery", target: input.issueId, recoveryHref: "/trash", work: () => executeRecoveryAction(input), describe: (value) => `${value.action}: ${value.outcome}` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "RECOVERY_ACTION_FAILED");
  }
}
