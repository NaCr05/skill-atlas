import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const MINIMUM_NODE_MAJOR = 20;

const currentFile = fileURLToPath(import.meta.url);
const defaultProjectDirectory = path.resolve(path.dirname(currentFile), "..", "..");

function localized(zh, en) {
  return { zh, en };
}

export function parseNodeMajor(version) {
  const major = Number.parseInt(String(version).replace(/^v/, "").split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

async function defaultFileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultRunCommand(command, args) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : command;
  const executableArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
  return spawnSync(executable, executableArgs, {
    encoding: "utf8",
    windowsHide: true,
  });
}

export async function isPortAvailable(port, host = DEFAULT_HOST) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(
  preferredPort,
  maximumPort = preferredPort + 10,
  probe = isPortAvailable,
) {
  for (let port = preferredPort; port <= maximumPort; port += 1) {
    if (await probe(port, DEFAULT_HOST)) return port;
  }
  return null;
}

export function parseLauncherArgs(args) {
  const options = {
    checkOnly: false,
    openBrowser: process.env.SKILL_ATLAS_NO_BROWSER !== "1",
    preferredPort: DEFAULT_PORT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") options.checkOnly = true;
    else if (argument === "--no-browser") options.openBrowser = false;
    else if (argument === "--port") {
      options.preferredPort = Number.parseInt(args[index + 1] || "", 10);
      index += 1;
    } else if (argument.startsWith("--port=")) {
      options.preferredPort = Number.parseInt(argument.slice("--port=".length), 10);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (!Number.isInteger(options.preferredPort) || options.preferredPort < 1 || options.preferredPort > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }
  return options;
}

export async function inspectLaunchEnvironment(options = {}) {
  const projectDirectory = path.resolve(options.projectDirectory || defaultProjectDirectory);
  const nodeVersion = options.nodeVersion || process.versions.node;
  const platform = options.platform || process.platform;
  const npmCommand = options.npmCommand || (platform === "win32" ? "npm.cmd" : "npm");
  const preferredPort = options.preferredPort || DEFAULT_PORT;
  const fileExists = options.fileExists || defaultFileExists;
  const readText = options.readText || ((filePath) => readFile(filePath, "utf8"));
  const runCommand = options.runCommand || defaultRunCommand;
  const portProbe = options.portProbe || isPortAvailable;
  const checks = [];

  const packagePath = path.join(projectDirectory, "package.json");
  const lockPath = path.join(projectDirectory, "package-lock.json");
  let packageName = null;
  let projectReady = false;
  try {
    const packageDocument = JSON.parse(await readText(packagePath));
    packageName = packageDocument.name || null;
    projectReady = packageName === "skill-atlas" && await fileExists(lockPath);
  } catch {
    projectReady = false;
  }
  checks.push({
    id: "project",
    status: projectReady ? "ok" : "blocked",
    label: localized("项目目录", "Project directory"),
    detail: projectReady
      ? localized(`已定位 Skill Atlas：${projectDirectory}`, `Skill Atlas found at ${projectDirectory}`)
      : localized("当前目录不是完整的 Skill Atlas 源码目录。", "This is not a complete Skill Atlas source directory."),
    repair: projectReady ? undefined : {
      cmd: "git clone https://github.com/NaCr05/skill-atlas.git && cd skill-atlas",
      powershell: "git clone https://github.com/NaCr05/skill-atlas.git; Set-Location skill-atlas",
    },
  });

  const nodeReady = parseNodeMajor(nodeVersion) >= MINIMUM_NODE_MAJOR;
  checks.push({
    id: "node",
    status: nodeReady ? "ok" : "blocked",
    label: localized("Node.js", "Node.js"),
    detail: nodeReady
      ? localized(`Node.js ${nodeVersion}（满足 20+）`, `Node.js ${nodeVersion} (20+ required)`)
      : localized(`检测到 Node.js ${nodeVersion}，需要 20 或更高版本。`, `Node.js ${nodeVersion} detected; version 20 or newer is required.`),
    repair: nodeReady ? undefined : {
      cmd: "winget install OpenJS.NodeJS.LTS",
      powershell: "winget install OpenJS.NodeJS.LTS",
    },
  });

  let npmVersion = "";
  try {
    const result = await runCommand(npmCommand, ["--version"]);
    npmVersion = String(result.stdout || "").trim();
    if (result.status !== 0 || !npmVersion) npmVersion = "";
  } catch {
    npmVersion = "";
  }
  checks.push({
    id: "npm",
    status: npmVersion ? "ok" : "blocked",
    label: localized("npm", "npm"),
    detail: npmVersion
      ? localized(`npm ${npmVersion} 已就绪`, `npm ${npmVersion} is ready`)
      : localized("未找到 npm。通常重新安装 Node.js LTS 即可修复。", "npm was not found. Reinstalling Node.js LTS usually fixes this."),
    repair: npmVersion ? undefined : {
      cmd: "winget install OpenJS.NodeJS.LTS",
      powershell: "winget install OpenJS.NodeJS.LTS",
    },
  });

  const dependencyFiles = [
    path.join(projectDirectory, "node_modules", "next", "package.json"),
    path.join(projectDirectory, "node_modules", "react", "package.json"),
  ];
  const dependenciesReady = projectReady && (await Promise.all(dependencyFiles.map(fileExists))).every(Boolean);
  checks.push({
    id: "dependencies",
    status: dependenciesReady ? "ok" : "blocked",
    label: localized("项目依赖", "Dependencies"),
    detail: dependenciesReady
      ? localized("Next.js 与 React 依赖已安装。", "Next.js and React dependencies are installed.")
      : localized("依赖尚未安装或不完整。请在项目目录执行修复命令。", "Dependencies are missing or incomplete. Run the repair command in the project directory."),
    repair: dependenciesReady ? undefined : {
      cmd: "npm ci",
      powershell: "npm.cmd ci",
    },
  });

  const maximumPort = Math.min(preferredPort + 10, 65535);
  const selectedPort = await findAvailablePort(preferredPort, maximumPort, portProbe);
  checks.push({
    id: "port",
    status: selectedPort === null ? "blocked" : selectedPort === preferredPort ? "ok" : "info",
    label: localized("本地端口", "Local port"),
    detail: selectedPort === null
      ? localized(`${preferredPort}–${maximumPort} 均被占用。`, `Ports ${preferredPort}–${maximumPort} are all occupied.`)
      : selectedPort === preferredPort
        ? localized(`端口 ${preferredPort} 可用。`, `Port ${preferredPort} is available.`)
        : localized(`端口 ${preferredPort} 已占用，将自动改用 ${selectedPort}。`, `Port ${preferredPort} is occupied; ${selectedPort} will be used automatically.`),
    repair: selectedPort === null ? {
      cmd: `start-skill-atlas.cmd --port ${Math.min(maximumPort + 1, 65535)}`,
      powershell: `.\\start-skill-atlas.ps1 --port ${Math.min(maximumPort + 1, 65535)}`,
    } : undefined,
  });

  return {
    ok: checks.every((check) => check.status !== "blocked"),
    projectDirectory,
    packageName,
    nodeVersion,
    npmVersion,
    preferredPort,
    selectedPort,
    checks,
  };
}

export function formatLaunchReport(report) {
  const statusLabel = { ok: "OK", info: "INFO", blocked: "BLOCKED" };
  const lines = ["", "Skill Atlas 启动检查 / startup check", "────────────────────────────────────────"];
  for (const check of report.checks) {
    lines.push(`[${statusLabel[check.status]}] ${check.label.zh} / ${check.label.en}`);
    lines.push(`      ${check.detail.zh}`);
    lines.push(`      ${check.detail.en}`);
    if (check.repair) {
      lines.push(`      CMD> ${check.repair.cmd}`);
      lines.push(`      PowerShell> ${check.repair.powershell}`);
    }
  }
  lines.push("────────────────────────────────────────");
  lines.push(report.ok ? "[READY] 环境已就绪 / Environment ready" : "[ACTION] 请按上方命令修复后重试 / Fix the items above and try again");
  lines.push("");
  return lines.join("\n");
}

export function getBrowserLaunchCommand(url, platform = process.platform) {
  if (platform === "win32") {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] };
  }
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

export function openBrowser(url, options = {}) {
  const launch = getBrowserLaunchCommand(url, options.platform);
  const spawnCommand = options.spawnCommand || spawn;
  const child = spawnCommand(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref?.();
}

export async function waitForServer(url, options = {}) {
  const fetcher = options.fetcher || fetch;
  const timeoutMs = options.timeoutMs || 60_000;
  const pollIntervalMs = options.pollIntervalMs || 350;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs && !options.signal?.aborted) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(1_500) });
      if (response) return true;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

function spawnDevelopmentServer(projectDirectory, port, options = {}) {
  const spawnCommand = options.spawnCommand || spawn;
  if ((options.platform || process.platform) === "win32") {
    const command = `npm.cmd run dev -- -p ${port}`;
    return spawnCommand(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      cwd: projectDirectory,
      env: { ...process.env, PORT: String(port) },
      stdio: "inherit",
      windowsHide: false,
    });
  }
  return spawnCommand("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: projectDirectory,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  });
}

export async function runLauncher(args = process.argv.slice(2), options = {}) {
  let cli;
  try {
    cli = parseLauncherArgs(args);
  } catch (error) {
    console.error(`[BLOCKED] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const report = await inspectLaunchEnvironment({
    ...options,
    preferredPort: cli.preferredPort,
  });
  console.log(formatLaunchReport(report));
  if (!report.ok) return 1;
  if (cli.checkOnly) return 0;

  const url = `http://${DEFAULT_HOST}:${report.selectedPort}`;
  console.log(`正在启动 Skill Atlas / Starting Skill Atlas: ${url}`);
  console.log("按 Ctrl+C 停止服务 / Press Ctrl+C to stop.\n");

  const child = spawnDevelopmentServer(report.projectDirectory, report.selectedPort, options);
  const controller = new AbortController();
  const readyTask = waitForServer(url, {
    signal: controller.signal,
    fetcher: options.fetcher,
    timeoutMs: options.serverTimeoutMs,
  }).then((ready) => {
    if (!ready) {
      console.warn("[INFO] 服务尚未就绪，浏览器未自动打开 / Server did not become ready; browser was not opened.");
      return;
    }
    if (cli.openBrowser) {
      openBrowser(url, options);
      console.log(`已打开浏览器 / Browser opened: ${url}`);
    }
  });

  const exitCode = await new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 0));
  });
  controller.abort();
  await readyTask;
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runLauncher().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
