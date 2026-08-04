import { checkForAppUpdate } from "@/core/releases/update-check";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { return Response.json(await checkForAppUpdate(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(request, error, "REQUEST_INVALID", 502); }
}
