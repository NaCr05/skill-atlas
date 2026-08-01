# Quick start

[简体中文](#中文快速启动)

This guide takes Skill Atlas from a fresh clone to the first copied Codex invocation Prompt.

## 1. Check the prerequisites

- Windows 10 or Windows 11
- Node.js 20 or newer
- npm, included with Node.js
- Codex with one or more installed Skills for the intended experience

Check Node.js from PowerShell:

```powershell
node --version
npm --version
```

## 2. Download and start Skill Atlas

```powershell
git clone https://github.com/NaCr05/skill-atlas.git
Set-Location skill-atlas
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Keep the PowerShell window open while using the app. Press `Ctrl+C` there when you want to stop it.

## 3. Complete the first workflow

1. Select **Rescan** to refresh the inventory from disk.
2. Enter a task such as “Review the accessibility of my React dashboard.”
3. Open a recommended Skill and check its purpose, rules, source, and readiness.
4. Select **Copy invocation Prompt**.
5. Paste the Prompt into Codex and replace the placeholders with your project details.

You can favorite or pin useful Skills, add local notes, and switch between Chinese and English. Skill names remain unchanged in both languages.

## Custom Codex location

Skill Atlas reads `CODEX_HOME` when it is an absolute path. Otherwise it uses `%USERPROFILE%\.codex`.

For a Codex directory on another drive:

```powershell
$env:CODEX_HOME = "D:\Codex"
npm run dev
```

The setting applies to that PowerShell session. Set the variable before starting the app.

## Optional integrations

Local discovery and default Prompt generation need no keys. To enable optional services:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` in a text editor and fill only the variables you need. Restart the development server after changing them. Never commit this file.

## Run a production build locally

```powershell
npm run build
npm run start
```

The production server also listens only on `127.0.0.1` by default.

## Troubleshooting

### PowerShell blocks the npm script

Use the Windows command shim:

```powershell
npm.cmd ci
npm.cmd run dev
```

### The page shows no personal Skills

Confirm that the Skill folders contain `SKILL.md` files under `%USERPROFILE%\.codex\skills`, or under the absolute directory configured by `CODEX_HOME`. Then select **Rescan**.

### Port 3000 is already in use

```powershell
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

本指南会带你从刚下载项目开始，一直完成第一次复制 Codex Skill 调用 Prompt。

## 1. 检查运行环境

- Windows 10 或 Windows 11
- Node.js 20 或更高版本
- npm（安装 Node.js 时会一并提供）
- 为了获得完整体验，Codex 中最好已经安装至少一个 Skill

在 PowerShell 中检查版本：

```powershell
node --version
npm --version
```

## 2. 下载并启动 Skill Atlas

```powershell
git clone https://github.com/NaCr05/skill-atlas.git
Set-Location skill-atlas
npm ci
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。使用网站期间请保持 PowerShell 窗口开启；需要停止时，在该窗口按 `Ctrl+C`。

## 3. 完成第一次使用

1. 点击**重新扫描**，从磁盘刷新 Skill 清单。
2. 输入一个任务，例如“检查我的 React 控制面板是否符合无障碍要求”。
3. 打开推荐结果，查看它的功能、调用规则、来源和就绪状态。
4. 点击**复制调用 Prompt**。
5. 把 Prompt 粘贴到 Codex，并用你的项目实际信息替换占位内容。

你还可以收藏或置顶常用 Skill、添加本地备注，并切换中文或英文。无论界面语言如何切换，Skill 名称都会保持原样。

## 自定义 Codex 目录

如果 `CODEX_HOME` 是绝对路径，Skill Atlas 会优先使用它；否则使用 `%USERPROFILE%\.codex`。

例如把 Codex 目录放在 D 盘：

```powershell
$env:CODEX_HOME = "D:\Codex"
npm run dev
```

这个设置只对当前 PowerShell 会话生效，请在启动应用前设置。

## 启用可选服务

本地发现和默认 Prompt 生成不需要任何密钥。若要启用可选服务：

```powershell
Copy-Item .env.example .env.local
```

用文本编辑器打开 `.env.local`，只填写需要的变量。修改后重新启动开发服务，并且不要把这个文件提交到 Git。

## 在本机运行生产版本

```powershell
npm run build
npm run start
```

生产服务默认也只监听 `127.0.0.1`。

## 常见问题

### PowerShell 阻止运行 npm 脚本

改用 Windows 命令入口：

```powershell
npm.cmd ci
npm.cmd run dev
```

### 页面没有显示个人 Skill

确认 `%USERPROFILE%\.codex\skills` 中的 Skill 文件夹包含 `SKILL.md`；如果设置了 `CODEX_HOME`，则检查对应绝对目录。确认后点击**重新扫描**。

### 3000 端口已被占用

```powershell
npm run dev -- -p 3001
```

然后打开 `http://127.0.0.1:3001`。

### Skill 市场或 AI 增强不可用

它们都是可选服务。本地 Skill 清单和确定性的调用 Prompt 仍会正常工作。你可以检查 `.env.local`、API 额度以及网站中的环境设置页面。

### 清除个人工作台数据

使用界面中的清除数据功能。收藏、置顶、备注、最近复制和本地指标保存在浏览器配置中，并未加密，因此不要在备注里保存密钥等敏感信息。
