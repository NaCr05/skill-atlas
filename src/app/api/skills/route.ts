import { discoverSkills } from "@/core/skills/discover";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { summarizeSkillInventory } from "@/core/skills/summary";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const inventory = summarizeSkillInventory(await discoverSkills());
  return Response.json(inventory, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const inventory = summarizeSkillInventory(await discoverSkills({ forceRefresh: true }));
    return Response.json(inventory, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "RESCAN_FAILED");
  }
}
