import { getSkillTrashOverview } from "@/core/lifecycle/skill-trash";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const overview = await getSkillTrashOverview();
    return Response.json(
      overview,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(request, error, "TRASH_READ_FAILED");
  }
}
