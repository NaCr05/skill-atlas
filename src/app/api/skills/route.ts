import { discoverSkills } from "@/core/skills/discover";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const inventory = await discoverSkills();
  return Response.json(inventory, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const inventory = await discoverSkills({ forceRefresh: true });
    return Response.json(inventory, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新扫描失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}
