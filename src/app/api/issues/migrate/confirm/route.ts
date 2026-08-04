import { z } from "zod";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmDuplicateMigration } from "@/core/issues/duplicate-migration";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
export const runtime = "nodejs";
const schema = z.object({ planId: z.uuid() });
export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request); const { planId } = schema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "duplicate-migration", target: planId, recoveryHref: "/operations", work: () => confirmDuplicateMigration(planId), describe: (value) => `${value.skillName} compatibility entry archived` });
    invalidateSkillInventoryCache(); return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "DUPLICATE_MIGRATION_FAILED"); }
}
