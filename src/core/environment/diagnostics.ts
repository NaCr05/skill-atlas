import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { resolveCodexEnvironment } from "@/core/skills/paths";

const minimumNodeMajor = 20;

export type DiagnosticStatus = "ready" | "action";

export interface LocalizedDiagnosticText {
  zh: string;
  en: string;
}

export interface RepairCommand {
  cmd: string;
  powershell: string;
}

export interface RuntimeDiagnosticCheck {
  id: "project" | "node" | "npm" | "dependencies" | "runtime" | "codex-home" | "skills-root";
  status: DiagnosticStatus;
  label: LocalizedDiagnosticText;
  detail: LocalizedDiagnosticText;
  repair?: RepairCommand;
}

export interface RuntimeDiagnostics {
  checkedAt: string;
  overall: "ready" | "needs-action";
  readyCount: number;
  actionCount: number;
  checks: RuntimeDiagnosticCheck[];
}

interface RuntimeDiagnosticOptions {
  projectDirectory?: string;
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  nodeVersion?: string;
  now?: () => Date;
  readText?: (filePath: string) => Promise<string>;
  checkAccess?: (filePath: string, mode: number) => Promise<void>;
}

function text(zh: string, en: string): LocalizedDiagnosticText {
  return { zh, en };
}

function nodeMajor(version: string): number {
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

async function canAccess(
  filePath: string,
  mode: number,
  checkAccess: RuntimeDiagnosticOptions["checkAccess"],
): Promise<boolean> {
  try {
    await (checkAccess || access)(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

async function commandExistsOnPath(
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
  checkAccess: RuntimeDiagnosticOptions["checkAccess"],
): Promise<boolean> {
  const pathValue = env.PATH || env.Path || "";
  const commandNames = process.platform === "win32" ? ["npm.cmd", "npm.exe"] : ["npm"];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const commandName of commandNames) {
      const candidate = path.join(directory.replace(/^"|"$/g, ""), commandName);
      if (await canAccess(candidate, fsConstants.F_OK, checkAccess)) return true;
    }
  }
  return false;
}

export async function inspectRuntimeEnvironment(
  options: RuntimeDiagnosticOptions = {},
): Promise<RuntimeDiagnostics> {
  const projectDirectory = path.resolve(options.projectDirectory || process.cwd());
  const env = options.env || process.env;
  const environment = resolveCodexEnvironment(env, options.homeDirectory);
  const skillsRoot = environment.sources.find((source) => source.kind === "personal")?.rootPath
    || path.join(environment.codexHome, "skills");
  const readText = options.readText || ((filePath: string) => readFile(filePath, "utf8"));
  const checks: RuntimeDiagnosticCheck[] = [];

  let projectReady = false;
  try {
    const packageDocument = JSON.parse(await readText(path.join(projectDirectory, "package.json"))) as { name?: string };
    projectReady = packageDocument.name === "skill-atlas"
      && await canAccess(path.join(projectDirectory, "package-lock.json"), fsConstants.R_OK, options.checkAccess);
  } catch {
    projectReady = false;
  }
  checks.push({
    id: "project",
    status: projectReady ? "ready" : "action",
    label: text("项目目录", "Project directory"),
    detail: projectReady
      ? text(`源码目录完整：${projectDirectory}`, `Source directory is complete: ${projectDirectory}`)
      : text("缺少 package.json 或 package-lock.json。", "package.json or package-lock.json is missing."),
    repair: projectReady ? undefined : {
      cmd: "git clone https://github.com/NaCr05/skill-atlas.git && cd skill-atlas",
      powershell: "git clone https://github.com/NaCr05/skill-atlas.git; Set-Location skill-atlas",
    },
  });

  const version = options.nodeVersion || process.versions.node;
  const nodeReady = nodeMajor(version) >= minimumNodeMajor;
  checks.push({
    id: "node",
    status: nodeReady ? "ready" : "action",
    label: text("Node.js 运行时", "Node.js runtime"),
    detail: nodeReady
      ? text(`Node.js ${version}，满足 20+ 要求。`, `Node.js ${version}; version 20+ requirement is met.`)
      : text(`当前为 Node.js ${version}，需要升级到 20+。`, `Node.js ${version} is installed; version 20+ is required.`),
    repair: nodeReady ? undefined : {
      cmd: "winget install OpenJS.NodeJS.LTS",
      powershell: "winget install OpenJS.NodeJS.LTS",
    },
  });

  const npmAgentMatch = env.npm_config_user_agent?.match(/(?:^|\s)npm\/([^\s]+)/);
  const npmVersion = npmAgentMatch?.[1] || "";
  const npmReady = Boolean(npmVersion) || await commandExistsOnPath(env, options.checkAccess);
  checks.push({
    id: "npm",
    status: npmReady ? "ready" : "action",
    label: text("npm 包管理器", "npm package manager"),
    detail: npmReady
      ? npmVersion
        ? text(`npm ${npmVersion} 可用。`, `npm ${npmVersion} is available.`)
        : text("已在 PATH 中找到 npm。", "npm was found on PATH.")
      : text("未检测到 npm。", "npm was not detected."),
    repair: npmReady ? undefined : {
      cmd: "winget install OpenJS.NodeJS.LTS",
      powershell: "winget install OpenJS.NodeJS.LTS",
    },
  });

  const dependenciesReady = await canAccess(
    path.join(projectDirectory, "node_modules", "next", "package.json"),
    fsConstants.R_OK,
    options.checkAccess,
  );
  checks.push({
    id: "dependencies",
    status: dependenciesReady ? "ready" : "action",
    label: text("项目依赖", "Project dependencies"),
    detail: dependenciesReady
      ? text("Next.js 依赖完整，可启动界面。", "Next.js dependencies are present and the interface can start.")
      : text("node_modules 缺失或不完整。", "node_modules is missing or incomplete."),
    repair: dependenciesReady ? undefined : { cmd: "npm ci", powershell: "npm.cmd ci" },
  });

  const activePort = env.PORT?.trim() || "3000";
  checks.push({
    id: "runtime",
    status: "ready",
    label: text("本地服务", "Local service"),
    detail: text(
      `当前服务仅在 127.0.0.1:${activePort} 提供访问。`,
      `The current service is available only at 127.0.0.1:${activePort}.`,
    ),
  });

  const codexHomeReadable = await canAccess(environment.codexHome, fsConstants.R_OK, options.checkAccess);
  checks.push({
    id: "codex-home",
    status: codexHomeReadable ? "ready" : "action",
    label: text("Codex 主目录", "Codex home"),
    detail: codexHomeReadable
      ? text(`可读取：${environment.codexHome}`, `Readable: ${environment.codexHome}`)
      : text(`目录不存在或不可读：${environment.codexHome}`, `Missing or unreadable: ${environment.codexHome}`),
    repair: codexHomeReadable ? undefined : {
      cmd: `mkdir "${environment.codexHome}"`,
      powershell: `New-Item -ItemType Directory -Force "${environment.codexHome}"`,
    },
  });

  const skillsRootWritable = await canAccess(skillsRoot, fsConstants.R_OK | fsConstants.W_OK, options.checkAccess);
  checks.push({
    id: "skills-root",
    status: skillsRootWritable ? "ready" : "action",
    label: text("个人 Skills 目录", "Personal Skills directory"),
    detail: skillsRootWritable
      ? text(`可读写：${skillsRoot}`, `Readable and writable: ${skillsRoot}`)
      : text(`目录不存在或不可写：${skillsRoot}`, `Missing or not writable: ${skillsRoot}`),
    repair: skillsRootWritable ? undefined : {
      cmd: `mkdir "${skillsRoot}"`,
      powershell: `New-Item -ItemType Directory -Force "${skillsRoot}"`,
    },
  });

  const actionCount = checks.filter((check) => check.status === "action").length;
  return {
    checkedAt: (options.now || (() => new Date()))().toISOString(),
    overall: actionCount === 0 ? "ready" : "needs-action",
    readyCount: checks.length - actionCount,
    actionCount,
    checks,
  };
}
