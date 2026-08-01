import { z } from "zod";

import { inspectGithubSkill } from "@/core/installer/inspect-source";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";

const inputSchema = z.object({
  sourceUrl: z.string().url().max(2_048),
  skillName: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const review = await inspectGithubSkill(input);
    return Response.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法审查安装源。";
    return Response.json({ error: message }, { status: 400 });
  }
}
