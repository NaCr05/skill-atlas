# Quick start

[简体中文](#中文快速启动)

This guide takes Skill Atlas from a fresh clone to the first copied Codex invocation Prompt. It explicitly covers both PowerShell and Command Prompt (CMD).

## 1. Check the prerequisites

- Windows 10 or Windows 11
- Node.js 20 or newer
- npm, included with Node.js
- Codex with one or more installed Skills for the intended experience

The following version checks work in both PowerShell and CMD:

```text
node --version
npm --version
```

### Identify your terminal

- **Command Prompt (CMD):** the window may be titled “Command Prompt,” and the prompt usually looks like `C:\Users\name>`.
- **PowerShell:** the window may be titled “PowerShell,” and the prompt usually starts with `PS`, such as `PS C:\Users\name>`.
- **Windows Terminal:** this is the tabbed host application; each tab can run either CMD or PowerShell. Check the tab title and prompt.

The basic startup commands below intentionally work in both shells.

## 2. Download and start Skill Atlas

Run these commands in either PowerShell or CMD:

```text
git clone https://github.com/NaCr05/skill-atlas.git
cd skill-atlas
npm ci
npm run dev
```

Before running `npm ci`, confirm that the prompt ends in `skill-atlas`, for example:

```text
C:\Users\name\skill-atlas>
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Keep the terminal window open while using the app. Press `Ctrl+C` there when you want to stop it.

## 3. Complete the first workflow

1. Select **Rescan** to refresh the inventory from disk.
2. Enter a task such as “Review the accessibility of my React dashboard.”
3. Open a recommended Skill and check its purpose, rules, source, and readiness.
4. Select **Copy invocation Prompt**.
5. Paste the Prompt into Codex and replace the placeholders with your project details.

You can favorite or pin useful Skills, add local notes, and switch between Chinese and English. Skill names remain unchanged in both languages.

## Custom Codex location

Skill Atlas reads `CODEX_HOME` when it is an absolute path. Otherwise it uses `%USERPROFILE%\.codex`.

PowerShell:

```powershell
$env:CODEX_HOME = "D:\Codex"
npm run dev
```

Command Prompt (CMD):

```bat
set "CODEX_HOME=D:\Codex"
npm run dev
```

The setting applies only to the current terminal session. Set it before starting the app.

## Optional integrations

Local discovery and default Prompt generation need no keys. To create the optional local environment file, use the command for your shell.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Command Prompt (CMD):

```bat
copy .env.example .env.local
```

Open `.env.local` in a text editor and fill only the variables you need. Restart the development server after changing them. Never commit this file.

## Run a production build locally

These commands work in both shells:

```text
npm run build
npm run start
```

The production server also listens only on `127.0.0.1` by default.

## Troubleshooting

### `npm ci` cannot find a lockfile, or npm cannot find `package.json`

You are probably still in the parent directory. Enter the cloned project first:

```text
cd skill-atlas
npm ci
npm run dev
```

Do not clone the repository again if the `skill-atlas` folder already exists.

### `Set-Location` is not recognized

You are using CMD with a PowerShell-only command. Use `cd skill-atlas` instead; it works in both shells.

### PowerShell blocks the npm script

Use the Windows command shim:

```powershell
npm.cmd ci
npm.cmd run dev
```

### The page shows no personal Skills

Confirm that the Skill folders contain `SKILL.md` files under `%USERPROFILE%\.codex\skills`, or under the absolute directory configured by `CODEX_HOME`. Then select **Rescan**.

### Port 3000 is already in use

```text
npm run dev -- -p 3001
```

Then open `http://127.0.0.1:3001`.

### Marketplace or AI enhancement is unavailable

These are optional integrations. The local inventory and deterministic invocation Prompt continue to work without them. Check `.env.local`, API quotas, and the environment page for details.

### Reset personal workspace data

Use the clear-data action in the interface. Favorites, pins, notes, recent copies, and local metrics are stored in the browser profile and are not encrypted, so do not use notes for secrets.

---

# 中文快速启动

[返回 English](#quick-start)

本指南会带你从下载项目开始，一直完成第一次复制 Codex Skill 调用 Prompt，并明确区分 PowerShell 和命令提示符（CMD）。

## 1. 检查运行环境

- Windows 10 或 Windows 11
- Node.js 20 或更高版本
- npm（安装 Node.js 时会一并提供）
- 为了获得完整体验，Codex 中最好已经安装至少一个 Skill

下面的版本检查命令可以同时用于 PowerShell 和 CMD：

```text
node --version
npm --version
```

### 判断当前使用的终端

- **命令提示符（CMD）：**窗口标题通常显示“命令提示符”，提示符一般类似 `C:\Users\用户名>`。
- **PowerShell：**窗口标题通常显示“PowerShell”，提示符一般以 `PS` 开头，例如 `PS C:\Users\用户名>`。
- **Windows Terminal：**它只是承载标签页的终端应用，每个标签页既可能运行 CMD，也可能运行 PowerShell，请查看标签标题和提示符。

下面的基础启动命令经过有意选择，可以同时用于这两种终端。

## 2. 下载并启动 Skill Atlas

在 PowerShell 或 CMD 中运行：

```text
git clone https://github.com/NaCr05/skill-atlas.git
cd skill-atlas
npm ci
npm run dev
```

执行 `npm ci` 前，请确认提示符已经进入 `skill-atlas` 目录，例如：

```text
C:\Users\用户名\skill-atlas>
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。使用网站期间请保持终端窗口开启；需要停止时，在该窗口按 `Ctrl+C`。

## 3. 完成第一次使用

1. 点击**重新扫描**，从磁盘刷新 Skill 清单。
2. 输入一个任务，例如“检查我的 React 控制面板是否符合无障碍要求”。
3. 打开推荐结果，查看它的功能、调用规则、来源和就绪状态。
4. 点击**复制调用 Prompt**。
5. 把 Prompt 粘贴到 Codex，并用你的项目实际信息替换占位内容。

你还可以收藏或置顶常用 Skill、添加本地备注，并切换中文或英文。无论界面语言如何切换，Skill 名称都会保持原样。

## 自定义 Codex 目录

如果 `CODEX_HOME` 是绝对路径，Skill Atlas 会优先使用它；否则使用 `%USERPROFILE%\.codex`。

PowerShell：

```powershell
$env:CODEX_HOME = "D:\Codex"
npm run dev
```

命令提示符（CMD）：

```bat
set "CODEX_HOME=D:\Codex"
npm run dev
```

这个设置只对当前终端会话生效，请在启动应用前设置。

## 启用可选服务

本地发现和默认 Prompt 生成不需要任何密钥。需要创建本地环境配置文件时，请使用当前终端对应的命令。

PowerShell：

```powershell
Copy-Item .env.example .env.local
```

命令提示符（CMD）：

```bat
copy .env.example .env.local
```

用文本编辑器打开 `.env.local`，只填写需要的变量。修改后重新启动开发服务，并且不要把这个文件提交到 Git。

## 在本机运行生产版本

下面的命令可以同时用于两种终端：

```text
npm run build
npm run start
```

生产服务默认也只监听 `127.0.0.1`。

## 常见问题

### `npm ci` 找不到 lockfile，或 npm 找不到 `package.json`

这通常表示当前仍停留在上一级目录。请先进入已经克隆的项目：

```text
cd skill-atlas
npm ci
npm run dev
```

如果 `skill-atlas` 文件夹已经存在，不需要重新克隆仓库。

### 无法识别 `Set-Location`

这表示你在 CMD 中使用了 PowerShell 专用命令。请改用 `cd skill-atlas`，它在两种终端中都能运行。

### PowerShell 阻止运行 npm 脚本

改用 Windows 命令入口：

```powershell
npm.cmd ci
npm.cmd run dev
```

### 页面没有显示个人 Skill

确认 `%USERPROFILE%\.codex\skills` 中的 Skill 文件夹包含 `SKILL.md`；如果设置了 `CODEX_HOME`，则检查对应绝对目录。确认后点击**重新扫描**。

### 3000 端口已被占用

```text
npm run dev -- -p 3001
```

然后打开 `http://127.0.0.1:3001`。

### Skill 市场或 AI 增强不可用

它们都是可选服务。本地 Skill 清单和确定性的调用 Prompt 仍会正常工作。你可以检查 `.env.local`、API 额度以及网站中的环境设置页面。

### 清除个人工作台数据

使用界面中的清除数据功能。收藏、置顶、备注、最近复制和本地指标保存在浏览器配置中，并未加密，因此不要在备注里保存密钥等敏感信息。
