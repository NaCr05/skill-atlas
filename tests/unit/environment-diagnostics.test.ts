import { describe, expect, it, vi } from "vitest";

import { inspectRuntimeEnvironment } from "@/core/environment/diagnostics";

describe("runtime environment diagnostics", () => {
  it("separates ready capabilities from items that need configuration", async () => {
    const diagnostics = await inspectRuntimeEnvironment({
      projectDirectory: "C:\\skill-atlas",
      env: {
        USERPROFILE: "C:\\Users\\tester",
        PORT: "3178",
        npm_config_user_agent: "npm/10.8.2 node/v20.18.0 win32 x64",
      },
      homeDirectory: "C:\\Users\\tester",
      nodeVersion: "20.18.0",
      now: () => new Date("2026-08-03T02:00:00.000Z"),
      readText: vi.fn(async () => JSON.stringify({ name: "skill-atlas" })),
      checkAccess: vi.fn(async () => undefined),
    });

    expect(diagnostics).toMatchObject({
      checkedAt: "2026-08-03T02:00:00.000Z",
      overall: "ready",
      readyCount: 7,
      actionCount: 0,
    });
    expect(diagnostics.checks.find((check) => check.id === "runtime")?.detail.zh).toContain("127.0.0.1:3178");
  });

  it("returns copyable repair commands without changing the machine", async () => {
    const diagnostics = await inspectRuntimeEnvironment({
      projectDirectory: "C:\\broken",
      env: { USERPROFILE: "C:\\Users\\tester" },
      homeDirectory: "C:\\Users\\tester",
      nodeVersion: "18.20.0",
      readText: vi.fn(async () => { throw new Error("missing"); }),
      checkAccess: vi.fn(async () => { throw new Error("missing"); }),
    });

    expect(diagnostics.overall).toBe("needs-action");
    expect(diagnostics.actionCount).toBe(6);
    expect(diagnostics.checks.find((check) => check.id === "node")?.repair?.cmd).toBe("winget install OpenJS.NodeJS.LTS");
    expect(diagnostics.checks.find((check) => check.id === "dependencies")?.repair?.powershell).toBe("npm.cmd ci");
  });

  it("recognizes npm from the npm-run environment when command lookup is restricted", async () => {
    const diagnostics = await inspectRuntimeEnvironment({
      projectDirectory: "C:\\skill-atlas",
      env: {
        USERPROFILE: "C:\\Users\\tester",
        npm_config_user_agent: "npm/11.3.0 node/v20.18.0 win32 x64",
      },
      homeDirectory: "C:\\Users\\tester",
      nodeVersion: "20.18.0",
      readText: vi.fn(async () => JSON.stringify({ name: "skill-atlas" })),
      checkAccess: vi.fn(async () => undefined),
    });

    expect(diagnostics.checks.find((check) => check.id === "npm")).toMatchObject({ status: "ready" });
  });
});
