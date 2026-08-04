import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows distribution assets", () => {
  it("ships a no-command-line launcher, installer recipe, and release workflow", async () => {
    const files = ["packaging/windows/Skill Atlas.vbs", "packaging/windows/desktop-launcher.mjs", "packaging/windows/skill-atlas.iss", "scripts/windows/package-windows.mjs", ".github/workflows/windows-installer.yml"];
    await Promise.all(files.map((file) => access(path.join(process.cwd(), file))));
    const installer = await readFile(path.join(process.cwd(), "packaging/windows/skill-atlas.iss"), "utf8");
    expect(installer).toContain("{autodesktop}");
    expect(installer).toContain("PrivilegesRequired=lowest");
  });
});
