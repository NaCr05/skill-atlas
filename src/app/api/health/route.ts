import { APP_VERSION } from "@/core/app-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { app: "skill-atlas", status: "ready", version: APP_VERSION },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Skill-Atlas-App": "skill-atlas",
      },
    },
  );
}
