import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("Windows distribution assets", () => {
  it("ships a no-command-line launcher, installer recipe, and release workflow", async () => {
    const files = ["packaging/windows/Skill Atlas.vbs", "packaging/windows/desktop-launcher.mjs", "packaging/windows/skill-atlas.iss", "scripts/windows/package-windows.mjs", "scripts/windows/smoke-installer.mjs", ".github/workflows/windows-installer.yml"];
    await Promise.all(files.map((file) => access(path.join(process.cwd(), file))));
    const installer = await readFile(path.join(process.cwd(), "packaging/windows/skill-atlas.iss"), "utf8");
    expect(installer).toContain("{autodesktop}");
    expect(installer).toContain("PrivilegesRequired=lowest");
    expect(installer).toContain("#ifndef SmokeMode");
    expect(installer).toContain('#define OutputBaseFilename "Skill-Atlas-Setup-" + MyAppVersion');
    const smoke = await readFile(path.join(process.cwd(), "scripts/windows/smoke-installer.mjs"), "utf8");
    expect(smoke).toContain("SKILL_ATLAS_RUN_INSTALLER_SMOKE");
    expect(smoke).toContain("fresh-install");
    expect(smoke).toContain("upgrade-install");
    expect(smoke).toContain("rollback-install");
  });

  it("creates an empty standalone public directory when a fresh checkout has no public assets", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-standalone-"));
    try {
      await mkdir(path.join(temporaryRoot, ".next", "standalone"), { recursive: true });
      await mkdir(path.join(temporaryRoot, ".next", "static"), { recursive: true });
      const script = path.join(process.cwd(), "scripts", "startup", "prepare-standalone.mjs");
      const result = spawnSync(process.execPath, [script], { cwd: temporaryRoot, encoding: "utf8" });

      expect(result.status, result.stderr).toBe(0);
      await expect(access(path.join(temporaryRoot, ".next", "standalone", "public"))).resolves.toBeUndefined();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
