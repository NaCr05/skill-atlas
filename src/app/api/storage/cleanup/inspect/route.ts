import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { inspectStorageCleanup } from "@/core/storage/storage-manager";

export const runtime = "nodejs";
const schema = z.object({ kind: z.enum(["update-backup", "disabled"]), id: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = schema.parse(await request.json());
    return Response.json(await inspectStorageCleanup(input.kind, input.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "STORAGE_READ_FAILED"); }
}
