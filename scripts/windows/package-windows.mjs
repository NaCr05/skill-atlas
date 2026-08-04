import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const dist = path.join(root, "dist", "windows");
const stage = path.join(dist, "app");
const standalone = path.join(root, ".next", "standalone");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "runtime"), { recursive: true });
for (const item of ["server.js", "package.json", ".next", "node_modules", "public"]) {
  await cp(path.join(standalone, item), path.join(stage, item), { recursive: true });
}
await cp(process.execPath, path.join(stage, "runtime", "node.exe"));
await cp(path.join(root, "packaging", "windows", "desktop-launcher.mjs"), path.join(stage, "desktop-launcher.mjs"));
await cp(path.join(root, "packaging", "windows", "Skill Atlas.vbs"), path.join(stage, "Skill Atlas.vbs"));
await cp(path.join(root, "src", "app", "favicon.ico"), path.join(stage, "skill-atlas.ico"));
await writeFile(path.join(stage, "distribution.json"), `${JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString(), node: process.version }, null, 2)}\n`);
console.log(`Staged standalone Windows app at ${stage}`);

if (!process.argv.includes("--stage-only")) {
  const candidates = [process.env.ISCC_PATH, "iscc.exe", "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"].filter(Boolean);
  let result;
  for (const command of candidates) {
    result = spawnSync(command, [`/DMyAppVersion=${pkg.version}`, `/DStageDir=${stage}`, `/DOutputDir=${path.join(dist, "installer")}`, path.join(root, "packaging", "windows", "skill-atlas.iss")], { stdio: "inherit", shell: false });
    if (!result.error) break;
  }
  if (!result || result.error || result.status !== 0) {
    throw new Error("Inno Setup 6 (ISCC.exe) is required to compile the .exe installer. The standalone app stage was created successfully.");
  }
}
