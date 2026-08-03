import { describe, expect, it, vi } from "vitest";

import {
  findAvailablePort,
  getBrowserLaunchCommand,
  inspectLaunchEnvironment,
  parseLauncherArgs,
} from "../../scripts/startup/launcher.mjs";

describe("Skill Atlas startup launcher", () => {
  it("accepts check-only and custom-port options", () => {
    expect(parseLauncherArgs(["--check", "--no-browser", "--port", "3210"])).toEqual({
      checkOnly: true,
      openBrowser: false,
      preferredPort: 3210,
    });
  });

  it("reports missing dependencies with commands for both Windows shells", async () => {
    const report = await inspectLaunchEnvironment({
      projectDirectory: "C:\\skill-atlas",
      nodeVersion: "20.18.0",
      platform: "win32",
      readText: vi.fn(async () => JSON.stringify({ name: "skill-atlas" })),
      fileExists: vi.fn(async (filePath: string) => !filePath.includes("node_modules")),
      runCommand: vi.fn(async () => ({ status: 0, stdout: "10.8.2\n" })),
      portProbe: vi.fn(async () => true),
    });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check: { id: string }) => check.id === "dependencies")).toMatchObject({
      status: "blocked",
      repair: { cmd: "npm ci", powershell: "npm.cmd ci" },
    });
  });

  it("falls back when the preferred port is occupied", async () => {
    const probe = vi.fn(async (port: number) => port !== 3000);
    await expect(findAvailablePort(3000, 3010, probe)).resolves.toBe(3001);
    expect(probe).toHaveBeenNthCalledWith(1, 3000, "127.0.0.1");
    expect(probe).toHaveBeenNthCalledWith(2, 3001, "127.0.0.1");
  });

  it("builds a detached Windows browser command", () => {
    const launch = getBrowserLaunchCommand("http://127.0.0.1:3001", "win32");
    expect(launch.command.toLowerCase()).toMatch(/cmd(?:\.exe)?$/);
    expect(launch.args).toEqual(["/d", "/s", "/c", "start", "", "http://127.0.0.1:3001"]);
  });
});
