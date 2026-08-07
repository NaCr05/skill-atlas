export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { app: "skill-atlas", status: "ready" },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Skill-Atlas-App": "skill-atlas",
      },
    },
  );
}
