import packageJson from "../../../../../package.json";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { createPortableServerData } from "@/core/data-portability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { return Response.json({ format: "skill-atlas-backup", version: 1, appVersion: packageJson.version, exportedAt: new Date().toISOString(), server: await createPortableServerData() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(request, error, "DATA_EXPORT_FAILED", 500); }
}
