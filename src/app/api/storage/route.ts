import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectManagedStorage } from "@/core/storage/storage-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return Response.json(await inspectManagedStorage(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(request, error, "STORAGE_READ_FAILED", 500); }
}
