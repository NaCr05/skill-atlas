import { z } from "zod";

import { confirmInstallation } from "@/core/installer/install-skill";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";

export const runtime = "nodejs";

const inputSchema = z.object({ planId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { planId } = inputSchema.parse(await request.json());
    const result = await confirmInstallation(planId);
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "安装失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}
