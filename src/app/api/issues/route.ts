import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { planInventoryIssues } from "@/core/issues/issue-planner";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { discoverSkills } from "@/core/skills/discover";
import { summarizeSkillInventory } from "@/core/skills/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const forceRefresh = new URL(request.url).searchParams.get("force") === "1";
    return Response.json(planInventoryIssues(summarizeSkillInventory(await discoverSkills({ forceRefresh }))), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "RESCAN_FAILED"); }
}
