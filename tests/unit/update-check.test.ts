import { describe, expect, it, vi } from "vitest";

import { checkForAppUpdate, isNewerVersion } from "@/core/releases/update-check";

describe("Windows application update checks", () => {
  it("compares semantic release versions", () => {
    expect(isNewerVersion("v0.2.0", "0.1.1")).toBe(true);
    expect(isNewerVersion("v0.1.1", "0.1.1")).toBe(false);
    expect(isNewerVersion("v0.1.0", "0.1.1")).toBe(false);
  });
  it("uses the GitHub release API only when called", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ tag_name: "v9.0.0", html_url: "https://github.com/NaCr05/skill-atlas/releases/tag/v9.0.0", published_at: "2026-08-04T00:00:00Z" }), { status: 200 }));
    const result = await checkForAppUpdate(fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ latestVersion: "9.0.0", updateAvailable: true });
  });
});
