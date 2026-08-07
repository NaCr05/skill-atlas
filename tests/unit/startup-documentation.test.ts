import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

const documentationSections = [
  {
    label: "English README",
    relativePath: "README.md",
    installerStart: "### Regular users: download the Windows installer",
    sourceStart: "### Developers: first installation from source",
    launchStart: "### How to launch quickly later",
    updateStart: "### How to update to the latest version",
    updateEnd: "## What it scans",
  },
  {
    label: "Chinese README",
    relativePath: "README.zh-CN.md",
    installerStart: "### 普通用户：下载 Windows 安装包",
    sourceStart: "### 开发者：首次从源码安装",
    launchStart: "### 以后如何快速启动",
    updateStart: "### 如何更新到最新版本",
    updateEnd: "## 会扫描哪些目录？",
  },
  {
    label: "English detailed guide",
    relativePath: "docs/quick-start.md",
    installerStart: "## 1. Regular users: download the Windows installer",
    sourceStart: "## 2. Developers: first installation from source",
    launchStart: "## 3. How to launch quickly later",
    updateStart: "## 4. How to update to the latest version",
    updateEnd: "## Manual fallback",
  },
  {
    label: "Chinese detailed guide",
    relativePath: "docs/quick-start.md",
    installerStart: "## 1. 普通用户：下载 Windows 安装包",
    sourceStart: "## 2. 开发者：首次从源码安装",
    launchStart: "## 3. 以后如何快速启动",
    updateStart: "## 4. 如何更新到最新版本",
    updateEnd: "## 手动启动备用方案",
  },
] as const;

function section(content: string, startMarker: string, endMarker: string) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new Error(`Missing documentation boundary: ${startMarker} -> ${endMarker}`);
  }

  return content.slice(start, end);
}

describe("scenario-based startup documentation", () => {
  it.each(documentationSections)("keeps $label installation, launch, and update steps separate", async (entry) => {
    const content = await readFile(path.join(projectRoot, entry.relativePath), "utf8");
    const sourceInstall = section(content, entry.sourceStart, entry.launchStart);
    const routineLaunch = section(content, entry.launchStart, entry.updateStart);
    const update = section(content, entry.updateStart, entry.updateEnd);

    expect(content).toContain(entry.installerStart);
    expect(sourceInstall).toContain("git clone https://github.com/NaCr05/skill-atlas.git");
    expect(sourceInstall).toContain("npm.cmd ci");
    expect(routineLaunch).toContain("start-skill-atlas.cmd");
    expect(routineLaunch).toContain(".\\start-skill-atlas.ps1");
    expect(routineLaunch).toContain("Browser opened:");
    expect(routineLaunch).not.toMatch(/^git clone /m);
    expect(routineLaunch).not.toMatch(/^git pull /m);
    expect(routineLaunch).not.toMatch(/^npm\.cmd ci$/m);
    expect(update).toContain("git switch main");
    expect(update).toContain("git pull --ff-only origin main");
    expect(update).toContain("npm.cmd ci");
    expect(content).not.toMatch(/\[http:\/\/127\.0\.0\.1:3000\]/);
  });
});
