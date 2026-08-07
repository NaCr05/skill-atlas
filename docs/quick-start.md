# Quick start

[简体中文](#中文快速启动)

This guide separates installation, normal startup, and updates so you only run the commands required for the current task. Choose the installer path unless you plan to develop Skill Atlas itself.

## 1. Regular users: download the Windows installer

This path needs neither Git, Node.js, nor a command line.

1. Open the [latest GitHub Release](https://github.com/NaCr05/skill-atlas/releases/latest).
2. Download and run the `Skill-Atlas-Setup-<version>.exe` attachment.
3. Open **Skill Atlas** from the Start menu or the optional desktop shortcut.

The installer bundles its own runtime. Windows may show a publisher warning for an unsigned community build; verify that the download came from this repository before continuing. Installing a newer package upgrades the application in place without removing personal Skills or `.skill-atlas` data.

## 2. Developers: first installation from source

Requirements:

- Windows 10 or Windows 11
- Git
- Node.js 20 or newer
- npm, included with Node.js
- Codex with one or more installed Skills for the intended experience

These checks work in both PowerShell and CMD:

```text
git --version
node --version
npm --version
```

Identify the terminal before copying commands:

- **Command Prompt (CMD):** the window may be titled “Command Prompt,” and the prompt usually looks like `C:\Users\name>`.
- **PowerShell:** the window may be titled “PowerShell,” and the prompt usually starts with `PS`, such as `PS C:\Users\name>`.
- **Windows Terminal:** this is the tabbed host application; each tab can run either CMD or PowerShell. Check the tab title and prompt.

Use the complete block for your terminal. Do not mix CMD and PowerShell syntax.

Command Prompt (CMD):

```bat
cd /d "%USERPROFILE%"
git clone https://github.com/NaCr05/skill-atlas.git "%USERPROFILE%\skill-atlas"
cd /d "%USERPROFILE%\skill-atlas"
npm.cmd ci
start-skill-atlas.cmd
```

PowerShell:

```powershell
$skillAtlasRepo = Join-Path $HOME "skill-atlas"
git clone https://github.com/NaCr05/skill-atlas.git $skillAtlasRepo
Set-Location $skillAtlasRepo
npm.cmd ci
.\start-skill-atlas.ps1
```

If `%USERPROFILE%\skill-atlas` already exists, do not clone it again. Use the launch or update section below.

## 3. How to launch quickly later

Installer users can open **Skill Atlas** from the Start menu or desktop shortcut. Source users only need to enter the existing clone and run its launcher.

Command Prompt (CMD):

```bat
cd /d "%USERPROFILE%\skill-atlas"
start-skill-atlas.cmd
```

PowerShell:

```powershell
Set-Location (Join-Path $HOME "skill-atlas")
.\start-skill-atlas.ps1
```

Keep the source-launch terminal open while using Skill Atlas, and press `Ctrl+C` there to stop it. The launcher scans ports 3000 through 3010 and polls `/api/health` for the Skill Atlas identity marker. It opens a browser only after that marker is present. Use only the URL shown after `Browser opened:`; never substitute a fixed port copied from another tab.

### Launcher options and diagnostics

Run the preflight without starting the site:

```text
start-skill-atlas.cmd --check
```

```powershell
.\start-skill-atlas.ps1 --check
```

Append `--port 3200` to select a specific port, or `--no-browser` to suppress automatic browser opening.

### Complete the first workflow

1. Select **Rescan** to refresh the inventory from disk.
2. Enter a task such as “Review the accessibility of my React dashboard.”
3. Open a recommended Skill and check its purpose, rules, source, and readiness.
4. Select **Copy invocation Prompt**.
5. Paste the Prompt into Codex and replace the placeholders with your project details.

You can favorite or pin useful Skills, add local notes, and switch between Chinese and English. Skill names remain unchanged in both languages. Open **Environment settings** for the read-only health check covering the source tree, runtime, dependencies, local service, Codex home, and personal Skills directory.

## 4. How to update to the latest version

- **Installer users:** select **Check for updates** under **Environment → Desktop install & app updates**, or open the [latest Release](https://github.com/NaCr05/skill-atlas/releases/latest). Download and run the newer installer.
- **Source users:** first press `Ctrl+C` in any old launcher terminal, then run the complete update block for the current shell.

Command Prompt (CMD):

```bat
cd /d "%USERPROFILE%\skill-atlas"
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd ci
start-skill-atlas.cmd
```

PowerShell:

```powershell
Set-Location (Join-Path $HOME "skill-atlas")
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd ci
.\start-skill-atlas.ps1
```

Stop if any Git or npm step fails instead of launching stale code. The fast-forward-only pull refuses to overwrite local commits.

## Manual fallback

If you prefer to start without the launcher, these commands work in either shell:

```text
npm ci
npm run dev
```

Then open the exact `Local` address printed by Next.js. Do not use a fixed port: if another local app owns port 3000, Next.js may print a different address.

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

Local discovery and default Prompt generation need no keys. The easiest AI setup is **Environment → AI connection console**: choose OpenAI or DeepSeek, enter a model and API key, then select **Save AI connection**. It takes effect immediately, survives refreshes and restarts, and never returns the saved key to the page.

Environment variables remain available as an advanced alternative. To create the optional local environment file, use the command for your shell.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Command Prompt (CMD):

```bat
copy .env.example .env.local
```

Open `.env.local` in a text editor and fill only the variables you need. Restart the development server after changing them. Never commit this file.

For OpenAI Prompt enhancement:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=your-model
```

For DeepSeek Prompt enhancement:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-key
DEEPSEEK_MODEL=deepseek-v4-flash
```

Page-managed settings override corresponding environment variables. **Restore environment settings** removes the encrypted page-managed file and returns to environment-variable resolution. `AI_PROVIDER=auto` selects a complete OpenAI configuration first, then DeepSeek. The Settings page shows the active provider without exposing its key. Missing configuration or a failed provider request keeps the local deterministic Prompt; Skill Atlas does not silently switch to another paid provider.

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

If PowerShell blocks `start-skill-atlas.ps1` itself, use the CMD launcher or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-skill-atlas.ps1
```

### Node.js is not installed

Both launchers print this copyable command:

```text
winget install OpenJS.NodeJS.LTS
```

After installation, close and reopen the terminal before launching again.

### The page shows no personal Skills

Confirm that the Skill folders contain `SKILL.md` files under `%USERPROFILE%\.codex\skills`, or under the absolute directory configured by `CODEX_HOME`. Then select **Rescan**.

### Port 3000 is already in use

The launcher automatically checks 3001 through 3010, selects the first available port, verifies the Skill Atlas identity response, and opens the matching address. Ignore any existing page on port 3000 when it belongs to another app. For manual startup, use `npm run dev -- -p 3001` and open the exact `Local` address printed by Next.js.

### Marketplace or AI enhancement is unavailable

These are optional integrations. The local inventory and deterministic invocation Prompt continue to work without them. Check `.env.local`, API quotas, and the environment page for details.

### Reset personal workspace data

Use the clear-data action in the interface. Favorites, pins, notes, recent copies, and local metrics are stored in the browser profile and are not encrypted, so do not use notes for secrets.

---

# 中文快速启动

[返回 English](#quick-start)

本指南把首次安装、日常启动和更新明确分开，让你只执行当前场景真正需要的步骤。除非你准备参与 Skill Atlas 开发，否则优先使用 Windows 安装包。

## 1. 普通用户：下载 Windows 安装包

这条路径不需要 Git、Node.js 或命令行。

1. 打开 [最新 GitHub Release](https://github.com/NaCr05/skill-atlas/releases/latest)。
2. 下载并运行附件中的 `Skill-Atlas-Setup-<版本号>.exe`。
3. 从开始菜单或安装时创建的桌面快捷方式打开 **Skill Atlas**。

安装包自带运行环境。未签名的社区构建可能触发 Windows 发布者提醒，请先确认文件来自本仓库再继续。运行新版安装包可以覆盖升级，不会删除个人 Skills 或 `.skill-atlas` 数据。

## 2. 开发者：首次从源码安装

环境要求：

- Windows 10 或 Windows 11
- Git
- Node.js 20 或更高版本
- npm（安装 Node.js 时会一并提供）
- 为了获得完整体验，Codex 中最好已经安装至少一个 Skill

下面的检查命令可以同时用于 PowerShell 和 CMD：

```text
git --version
node --version
npm --version
```

复制命令前请先辨认终端：

- **命令提示符（CMD）：**窗口标题通常显示“命令提示符”，提示符一般类似 `C:\Users\用户名>`。
- **PowerShell：**窗口标题通常显示“PowerShell”，提示符一般以 `PS` 开头，例如 `PS C:\Users\用户名>`。
- **Windows Terminal：**它只是承载标签页的终端应用，每个标签页既可能运行 CMD，也可能运行 PowerShell，请查看标签标题和提示符。

请完整复制与你当前终端对应的代码块，不要混用 CMD 和 PowerShell 语法。

命令提示符（CMD）：

```bat
cd /d "%USERPROFILE%"
git clone https://github.com/NaCr05/skill-atlas.git "%USERPROFILE%\skill-atlas"
cd /d "%USERPROFILE%\skill-atlas"
npm.cmd ci
start-skill-atlas.cmd
```

PowerShell：

```powershell
$skillAtlasRepo = Join-Path $HOME "skill-atlas"
git clone https://github.com/NaCr05/skill-atlas.git $skillAtlasRepo
Set-Location $skillAtlasRepo
npm.cmd ci
.\start-skill-atlas.ps1
```

如果 `%USERPROFILE%\skill-atlas` 已经存在，请不要再次克隆，直接使用下面的“快速启动”或“更新”步骤。

## 3. 以后如何快速启动

安装包用户直接从开始菜单或桌面快捷方式打开 **Skill Atlas**。源码用户只需进入已经克隆的目录并运行启动器。

命令提示符（CMD）：

```bat
cd /d "%USERPROFILE%\skill-atlas"
start-skill-atlas.cmd
```

PowerShell：

```powershell
Set-Location (Join-Path $HOME "skill-atlas")
.\start-skill-atlas.ps1
```

源码启动期间请保持终端开启，需要停止时在其中按 `Ctrl+C`。启动器会检查 3000 到 3010，并通过 `/api/health` 校验 Skill Atlas 专属身份标识。只有确认成功才会打开浏览器；请只使用终端显示 `Browser opened:` 后自动打开的地址，不要从其他标签页复制固定端口。

### 启动选项与环境体检

可以只体检、不启动网站：

```text
start-skill-atlas.cmd --check
```

```powershell
.\start-skill-atlas.ps1 --check
```

需要指定端口时追加 `--port 3200`；不想自动打开浏览器时追加 `--no-browser`。

### 完成第一次使用

1. 点击**重新扫描**，从磁盘刷新 Skill 清单。
2. 输入一个任务，例如“检查我的 React 控制面板是否符合无障碍要求”。
3. 打开推荐结果，查看它的功能、调用规则、来源和就绪状态。
4. 点击**复制调用 Prompt**。
5. 把 Prompt 粘贴到 Codex，并用你的项目实际信息替换占位内容。

你还可以收藏或置顶常用 Skill、添加本地备注，并切换中文或英文。打开**环境设置**可以查看源码、运行时、依赖、当前本地服务、Codex 主目录和个人 Skills 目录的只读环境体检。

## 4. 如何更新到最新版本

- **安装包用户：**在**环境设置 → 桌面安装与应用升级**中点击**手动检查更新**，或打开 [最新 Release](https://github.com/NaCr05/skill-atlas/releases/latest)，下载并运行新版安装包。
- **源码用户：**先在旧的启动终端按 `Ctrl+C`，再执行与你当前终端对应的完整更新代码块。

命令提示符（CMD）：

```bat
cd /d "%USERPROFILE%\skill-atlas"
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd ci
start-skill-atlas.cmd
```

PowerShell：

```powershell
Set-Location (Join-Path $HOME "skill-atlas")
git fetch origin
git switch main
git pull --ff-only origin main
npm.cmd ci
.\start-skill-atlas.ps1
```

任何 Git 或 npm 步骤报错时都应停下，不要继续启动旧代码；只允许快进的拉取不会覆盖本地提交。

## 手动启动备用方案

如果不想使用启动器，下面的命令在两种终端中都可用：

```text
npm ci
npm run dev
```

然后打开 Next.js 输出的准确 `Local` 地址。不要固定使用某个端口：如果 3000 已被其他本地应用占用，Next.js 会显示其他地址。

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

本地发现和默认 Prompt 生成不需要任何密钥。配置 AI 最简单的方式是打开**环境设置 → AI 连接配置台**：选择 OpenAI 或 DeepSeek，填写模型和 API Key，然后点击**保存 AI 连接**。配置立即生效，刷新和重启后仍然保留，已保存的密钥不会再回传到页面。

环境变量仍可作为高级备用方式。需要创建本地环境配置文件时，请使用当前终端对应的命令。

PowerShell：

```powershell
Copy-Item .env.example .env.local
```

命令提示符（CMD）：

```bat
copy .env.example .env.local
```

用文本编辑器打开 `.env.local`，只填写需要的变量。修改后重新启动开发服务，并且不要把这个文件提交到 Git。

使用 OpenAI 增强 Prompt：

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=你的模型名称
```

使用 DeepSeek 增强 Prompt：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-v4-flash
```

页面保存的配置优先于对应的环境变量。点击**恢复环境变量**会删除页面加密配置并恢复环境变量。`AI_PROVIDER=auto` 会优先选择配置完整的 OpenAI，其次选择 DeepSeek。环境设置页会显示当前提供商，但不会显示密钥。配置缺失或提供商请求失败时，会保留本地确定性 Prompt，不会静默切换到另一个付费提供商。

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

如果 PowerShell 阻止 `start-skill-atlas.ps1` 本身，可以改用 CMD 启动器，或运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-skill-atlas.ps1
```

### 没有安装 Node.js

两个启动器都会显示这条可复制的修复命令：

```text
winget install OpenJS.NodeJS.LTS
```

安装结束后，请关闭并重新打开终端，再次启动。

### 页面没有显示个人 Skill

确认 `%USERPROFILE%\.codex\skills` 中的 Skill 文件夹包含 `SKILL.md`；如果设置了 `CODEX_HOME`，则检查对应绝对目录。确认后点击**重新扫描**。

### 3000 端口已被占用

启动器会自动继续检查 3001 到 3010，选择第一个可用端口，确认响应方确实是 Skill Atlas，再打开正确地址。如果 3000 上已有其他应用，请忽略那个旧页面。手动启动时可以使用 `npm run dev -- -p 3001`，并打开 Next.js 打印的准确 `Local` 地址。

### Skill 市场或 AI 增强不可用

它们都是可选服务。本地 Skill 清单和确定性的调用 Prompt 仍会正常工作。你可以检查 `.env.local`、API 额度以及网站中的环境设置页面。

### 清除个人工作台数据

使用界面中的清除数据功能。收藏、置顶、备注、最近复制和本地指标保存在浏览器配置中，并未加密，因此不要在备注里保存密钥等敏感信息。
