import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmInstallation } from "@/core/installer/install-skill";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";

const inputSchema = z.object({ planId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { planId } = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "install", target: planId, recoveryHref: "/marketplace", work: () => confirmInstallation(planId), describe: (value) => `${value.skillName} installed to ${value.targetDirectory}` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "INSTALL_FAILED");
  }
}
