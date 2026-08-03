# Skill Atlas

[English](README.md)

**知道该用哪个 Codex Skill、为什么适合，以及怎样正确调用。**

[![CI](https://github.com/NaCr05/skill-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/NaCr05/skill-atlas/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-f5b942.svg)](LICENSE)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5fa04e)
![平台：Windows](https://img.shields.io/badge/Platform-Windows-4b72ff)

Skill Atlas 是一个面向 Windows、在本机运行的 Codex Skills 管理面板。它能扫描电脑上已有的 Skill，将不断增长的文件夹集合整理成可搜索、可理解、可正确调用的个人能力工作台，并提供就绪状态检查、关联推荐和“先审查、再安装”的安全流程。

![Skill Atlas 控制面板](artifacts/dashboard-desktop.png)

## 为什么需要 Skill Atlas？

当 Skill 越装越多时，人很难记住每个 Skill 的功能、触发规则、依赖和来源。Skill Atlas 把这些信息集中展示，并帮助你从“这项任务该用什么？”快速走到一段可以复制到 Codex 的调用 Prompt，同时不会修改已经安装的 Skill 文件。

| 你的需求 | Skill Atlas 提供的能力 |
| --- | --- |
| 找到合适的 Skill | 按名称、功能、标签搜索，或直接用自然语言描述任务。 |
| 判断是否真的可用 | 分别展示结构有效性、调用方式和运行环境是否就绪。 |
| 正确调用 Skill | 按当前界面语言生成可编辑的调用 Prompt。 |
| 建立个人工作台 | 收藏、置顶、添加个人备注，并查看最近复制记录。 |
| 理清来源和关系 | 查看源目录、配套文件、依赖及关联 Skill。 |
| 发现新的 Skill | 搜索 SkillsMP，并在安装前审查 GitHub 上完整的 Skill 文件树。 |

## 快速启动

环境要求：Windows 10/11、Node.js 20 或更高版本（安装 Node.js 时会包含 npm）。

先克隆项目并进入目录：

```text
git clone https://github.com/NaCr05/skill-atlas.git
cd skill-atlas
```

命令提示符（CMD）运行：

```bat
start-skill-atlas.cmd
```

PowerShell 运行：

```powershell
.\start-skill-atlas.ps1
```

启动器会自动检查项目目录、Node.js、npm、项目依赖和本地端口。如果首次启动缺少依赖，请复制它显示的修复命令（`npm ci` 或 `npm.cmd ci`）执行一次，再重新启动。服务就绪后会自动选择可用端口并打开浏览器。

然后：

1. 点击**重新扫描**，读取当前电脑上的 Skill 清单。
2. 描述你要完成的任务，或直接搜索某个 Skill。
3. 打开结果，确认调用规则，然后点击**复制调用 Prompt**。
4. 把 Prompt 粘贴到 Codex，再补充你的具体任务信息。

如何辨认终端、修复 Node 缺失、处理 PowerShell 执行策略、手动启动、环境体检和生产模式，请查看[完整快速启动指南](docs/quick-start.md#中文快速启动)。

## 会扫描哪些目录？

Skill Atlas 以本地文件系统为事实来源，可以识别：

- `%CODEX_HOME%\skills` 或 `%USERPROFILE%\.codex\skills` 中的个人 Skill；
- `.system` 目录中的 Codex 系统 Skill；
- 插件缓存里当前实际生效版本所提供的 Skill；
- 作为只读兼容来源的 `.agents` 和 skill-manager 共享目录。

过期的插件缓存版本不会显示；兼容目录和共享目录保持只读。推断说明、机器翻译和 AI 输出都不会写回已安装的 `SKILL.md`。

## 可选服务

本地清单、任务推荐和默认 Prompt 功能都不需要 API Key。只有需要额外服务时，才需要把 `.env.example` 复制为 `.env.local` 并填写对应配置。

| 环境变量 | 用途 | 是否必需 |
| --- | --- | --- |
| `SKILLSMP_API_KEY` | 提高 SkillsMP 搜索额度 | 否 |
| `VERCEL_OIDC_TOKEN` | 访问 skills.sh 官方 API | 否 |
| `GITHUB_TOKEN` | 提高 GitHub 公共仓库 API 限额 | 否 |
| `OPENAI_API_KEY` 和 `OPENAI_MODEL` | 可选的个性化 Prompt 增强 | 否 |

所有可选服务不可用时，应用都会自动退回本地能力或公开链接。请勿提交 `.env.local`，也不要在个人备注中保存密钥。

## 安全与隐私

- 应用默认只监听 `127.0.0.1`，不包含用户账户和云同步。
- 安装 GitHub Skill 前会先检查完整文件树、脚本、元数据、大小和阻断风险。
- 安装需要二次确认，只会写入已解析的 Codex Skills 目录；遇到同名目录会拒绝覆盖，也不会执行下载到的脚本。
- 收藏、备注、最近复制记录和轻量使用指标只保存在浏览器本地。

修改文件系统或安装逻辑前，请先阅读[安全模型](docs/security-model.md)。发现安全漏洞时，请按照 [SECURITY.md](SECURITY.md) 中的方式私下报告。

## 参与开发

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

相关文档：

- [快速启动](docs/quick-start.md#中文快速启动)
- [架构说明](docs/architecture.md)
- [开发流程](docs/development.md)
- [安全模型](docs/security-model.md)
- [测试策略](docs/testing.md)
- [贡献指南](CONTRIBUTING.md)

## 当前范围

首个公开版本聚焦 Codex 和 Windows。它不会更新或永久删除 Skill，不会自动运行 Codex，不会把数据同步到云端，也不提供用户账户。Claude 兼容来源和 macOS 支持属于未来可能方向，并不是当前承诺。

## 贡献与许可证

欢迎提交 Issue 和 Pull Request。提出改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

项目使用 [MIT License](LICENSE) 开源。Copyright © 2026 NaCr05。
