import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectDirectory = path.resolve(import.meta.dirname, "..", "..");
const cmdScript = path.join(projectDirectory, "start-skill-atlas.cmd");
const powershellScript = path.join(projectDirectory, "start-skill-atlas.ps1");
const windowsOnly = process.platform === "win32" ? describe : describe.skip;

windowsOnly("Windows startup scripts", () => {
  it("runs the CMD preflight from any working directory", async () => {
    const shell = process.env.ComSpec || "cmd.exe";
    const result = await execFileAsync(shell, ["/d", "/s", "/c", cmdScript, "--check", "--no-browser"], {
      cwd: path.dirname(projectDirectory),
      timeout: 20_000,
      windowsHide: true,
    });
    expect(result.stdout).toContain("Environment ready");
  }, 20_000);

  it("runs the PowerShell preflight from any working directory", async () => {
    const powershell = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const result = await execFileAsync(powershell, [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", powershellScript,
      "--check",
      "--no-browser",
    ], {
      cwd: path.dirname(projectDirectory),
      timeout: 20_000,
      windowsHide: true,
    });
    expect(result.stdout).toContain("Environment ready");
  }, 20_000);

  it("gives a repair command when Node.js is missing", async () => {
    const shell = process.env.ComSpec || "cmd.exe";
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    let output = "";
    let exitCode = 0;
    try {
      await execFileAsync(shell, ["/d", "/s", "/c", cmdScript, "--check", "--no-browser"], {
        cwd: projectDirectory,
        env: { ...process.env, PATH: path.join(systemRoot, "System32") },
        timeout: 20_000,
        windowsHide: true,
      });
    } catch (error) {
      const failure = error as Error & { code?: number; stdout?: string };
      output = failure.stdout || "";
      exitCode = failure.code || 0;
    }
    expect(exitCode).toBe(1);
    expect(output).toContain("winget install OpenJS.NodeJS.LTS");
  }, 20_000);
});
