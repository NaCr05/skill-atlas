import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

if (process.platform !== "win32") {
  throw new Error("The installer smoke test is Windows-only.");
}
if (process.env.SKILL_ATLAS_RUN_INSTALLER_SMOKE !== "1") {
  throw new Error("Set SKILL_ATLAS_RUN_INSTALLER_SMOKE=1 to authorize the isolated installer smoke test.");
}

const root = process.cwd();
const stage = path.join(root, "dist", "windows", "app");
const recipe = path.join(root, "packaging", "windows", "skill-atlas.iss");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await access(path.join(stage, "distribution.json"));

const isccCandidates = [
  process.env.ISCC_PATH,
  "iscc.exe",
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
].filter(Boolean);
const iscc = isccCandidates.find((candidate) => {
  const result = spawnSync(candidate, ["/?"], { windowsHide: true, stdio: "ignore", shell: false });
  return !result.error;
});
if (!iscc) throw new Error("Inno Setup 6 (ISCC.exe) is required for the installer smoke test.");

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-installer-smoke-"));
const resolvedTemp = path.resolve(os.tmpdir()) + path.sep;
if (!path.resolve(temporaryRoot).startsWith(resolvedTemp)) {
  throw new Error("Refusing to use a smoke-test directory outside the OS temporary directory.");
}

const baseVersion = "0.0.0-smoke-base";
const baseStage = path.join(temporaryRoot, "base-stage");
const installerOutput = path.join(temporaryRoot, "installers");
const installDirectory = path.join(temporaryRoot, "installed-app");
const smokeAppId = `{{${randomUUID().toUpperCase()}}`;
let installed = false;

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed${result.error ? `: ${result.error.message}` : ` with exit code ${result.status}`}.`);
  }
}

function compileInstaller({ version, sourceStage, outputName }) {
  run(iscc, [
    `/DMyAppVersion=${version}`,
    "/DMyAppName=Skill Atlas Smoke Test",
    `/DMyAppId=${smokeAppId}`,
    `/DStageDir=${sourceStage}`,
    `/DOutputDir=${installerOutput}`,
    `/DOutputBaseFilename=${outputName}`,
    "/DSmokeMode=1",
    recipe,
  ], `Compile ${version} smoke installer`);
  return path.join(installerOutput, `${outputName}.exe`);
}

function install(installer, label) {
  run(installer, [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    `/DIR=${installDirectory}`,
    `/LOG=${path.join(temporaryRoot, `${label}.log`)}`,
  ], label);
  installed = true;
}

function uninstall(label) {
  const entries = readdirSync(installDirectory);
  const uninstallerName = entries
    .filter((entry) => /^unins\d+\.exe$/i.test(entry))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0];
  if (!uninstallerName) {
    throw new Error(`${label} failed: no Inno Setup uninstaller was found in ${installDirectory}. Entries: ${entries.join(", ")}`);
  }
  const uninstaller = path.join(installDirectory, uninstallerName);
  run(uninstaller, [
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    `/LOG=${path.join(temporaryRoot, `${label}.log`)}`,
  ], label);
  installed = false;
}

async function expectInstalledVersion(version) {
  const distribution = JSON.parse(await readFile(path.join(installDirectory, "distribution.json"), "utf8"));
  if (distribution.version !== version) {
    throw new Error(`Expected installed version ${version}, received ${distribution.version}.`);
  }
}

async function verifyInstalledApp() {
  const port = 3199;
  const child = spawn(path.join(installDirectory, "runtime", "node.exe"), ["server.js"], {
    cwd: installDirectory,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      CODEX_HOME: path.join(temporaryRoot, "codex-home"),
      USERPROFILE: path.join(temporaryRoot, "user-profile"),
      LOCALAPPDATA: path.join(temporaryRoot, "local-app-data"),
    },
  });
  try {
    let response;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/skills?summary=1`, { signal: AbortSignal.timeout(500) });
      } catch {
        // The installed server is still starting.
      }
      if (response?.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Installed Skill Atlas did not become ready.");
  } finally {
    child.kill();
  }
}

try {
  await cp(stage, baseStage, { recursive: true });
  const baseDistributionPath = path.join(baseStage, "distribution.json");
  const baseDistribution = JSON.parse(await readFile(baseDistributionPath, "utf8"));
  await writeFile(baseDistributionPath, `${JSON.stringify({ ...baseDistribution, version: baseVersion }, null, 2)}\n`);

  const baseInstaller = compileInstaller({ version: baseVersion, sourceStage: baseStage, outputName: "Skill-Atlas-Smoke-Base" });
  const currentInstaller = compileInstaller({ version: pkg.version, sourceStage: stage, outputName: "Skill-Atlas-Smoke-Current" });

  install(baseInstaller, "fresh-install");
  await expectInstalledVersion(baseVersion);

  install(currentInstaller, "upgrade-install");
  await expectInstalledVersion(pkg.version);
  await verifyInstalledApp();

  uninstall("remove-current-before-rollback");
  install(baseInstaller, "rollback-install");
  await expectInstalledVersion(baseVersion);
  uninstall("final-uninstall");

  console.log("Installer smoke test passed: fresh install, upgrade, installed launch, rollback, and uninstall.");
} finally {
  if (installed) {
    try {
      uninstall("cleanup-uninstall");
    } catch (error) {
      console.error(error);
    }
  }
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
}
