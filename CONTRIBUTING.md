# Contributing to Skill Atlas

[中文说明](#中文贡献说明)

Thank you for helping make installed Codex Skills easier to find, understand, and use. Skill Atlas is currently Windows-first, local-only, and deliberately conservative around filesystem writes.

## Before opening an issue

- Search existing issues to avoid duplicates.
- Use the bug or feature form when possible.
- Remove API keys, access tokens, usernames, private paths, and proprietary Skill content from logs and screenshots.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Local development

Requirements: Windows 10/11, Node.js 20+, and npm.

```powershell
git clone https://github.com/NaCr05/skill-atlas.git
Set-Location skill-atlas
npm ci
npm run dev
```

Create a focused branch, keep changes small enough to review, and explain the user problem rather than only the implementation.

## Required verification

Run the complete gate before opening a pull request:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Add or update tests for changed behavior. UI changes should be checked at desktop and mobile widths in both Chinese and English.

## Project rules

- Treat the filesystem as the source of truth. Do not write inferred metadata, translations, or AI output into an installed `SKILL.md`.
- Keep compatibility and shared Skill sources read-only.
- Any installation remains review-before-write, must reject overwrites, and must never execute downloaded scripts.
- Preserve the distinction between structural validity, invocation policy, and environment readiness.
- Prefer deterministic local behavior. Optional network or AI features must fail gracefully.
- Do not add real personal Skill inventories, user paths, secrets, or private repository data to fixtures or screenshots.
- Update the relevant files under `docs/` when architecture, security boundaries, testing, or setup changes.

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), [security model](docs/security-model.md), and [testing strategy](docs/testing.md) before making cross-cutting changes.

## Pull requests

A useful pull request includes:

- the problem and intended outcome;
- the smallest practical implementation;
- tests and manual verification notes;
- screenshots for visible UI changes;
- security or privacy impact, especially for filesystem, GitHub, marketplace, storage, or AI behavior.

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).

---

# 中文贡献说明

感谢你帮助 Skill Atlas 变得更易发现、更易理解，也更容易正确调用。当前项目优先支持 Windows，在本机运行，并且对文件写入采取谨慎策略。

## 提交 Issue 前

- 先搜索已有 Issue，避免重复。
- 尽量使用 Bug 或功能建议模板。
- 从日志和截图中移除 API Key、访问令牌、用户名、私人路径和非公开 Skill 内容。
- 安全漏洞请按照 [SECURITY.md](SECURITY.md) 私下报告，不要公开提交 Issue。

## 本地开发与验证

需要 Windows 10/11、Node.js 20 或更高版本以及 npm。

```powershell
git clone https://github.com/NaCr05/skill-atlas.git
Set-Location skill-atlas
npm ci
npm run dev
```

提交 Pull Request 前请完整运行：

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

行为发生变化时应增加或更新测试；界面改动需要检查桌面端、移动端、中文和英文模式。

## 核心约束

- 以文件系统为事实来源，不把推断元数据、翻译或 AI 输出写回已安装的 `SKILL.md`。
- 兼容来源和共享 Skill 来源保持只读。
- 安装必须先审查再写入，拒绝覆盖已有目录，并且不执行下载脚本。
- 保持“结构有效”“调用方式”“环境就绪”三个状态相互独立。
- 优先采用确定性的本地能力；可选网络或 AI 服务失败时必须平稳降级。
- 测试数据和公开截图中不得包含真实个人 Skill 清单、用户路径、密钥或私有仓库数据。
- 如果修改架构、安全边界、测试或安装方式，请同步更新 `docs/` 下的文档。

请在进行跨模块改动前阅读 [AGENTS.md](AGENTS.md)、[架构说明](docs/architecture.md)、[安全模型](docs/security-model.md)和[测试策略](docs/testing.md)。贡献内容将按照项目的 [MIT License](LICENSE) 发布。
