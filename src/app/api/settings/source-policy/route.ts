import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { loadSourcePolicy, saveSourcePolicy } from "@/core/source-policy/source-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  trustedOwners: z.array(z.string().min(1).max(100)).max(200),
  trustedRepositories: z.array(z.string().min(3).max(220)).max(300),
  trustMode: z.enum(["advisory", "require"]),
  licenseMode: z.enum(["advisory", "allow-list"]),
  allowedLicenses: z.array(z.string().min(1).max(80)).max(100),
  warnArchived: z.boolean(),
});

export async function GET(request: Request) {
  try { return Response.json(await loadSourcePolicy(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(request, error, "SOURCE_POLICY_FAILED", 500); }
}

export async function PUT(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json(await saveSourcePolicy(schema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "SOURCE_POLICY_FAILED"); }
}
