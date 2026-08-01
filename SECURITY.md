# Security policy

[中文说明](#中文安全说明)

## Supported versions

Until Skill Atlas publishes stable releases, security fixes target the latest code on the default branch. After versioned releases begin, this section will list the supported release lines.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository:

`https://github.com/NaCr05/skill-atlas/security/advisories/new`

Include the affected version or commit, reproduction steps, impact, and a minimal proof of concept. Remove API keys, private Skill content, personal paths, and unrelated user data. You should receive an acknowledgement within seven days; investigation and fix timing will depend on severity and reproducibility.

Security-sensitive areas include:

- path resolution and traversal protection;
- local Skill discovery and file reads;
- GitHub tree inspection and installation;
- overwrite prevention and filesystem write boundaries;
- browser-local notes and usage data;
- optional API credentials and network integrations.

Skill Atlas never needs your Codex account password. Do not send secrets in an issue, discussion, screenshot, or personal note.

---

# 中文安全说明

## 支持范围

在 Skill Atlas 发布稳定版本之前，安全修复以默认分支中的最新代码为目标。开始发布带版本号的正式版本后，这里会列出仍受支持的版本线。

## 报告安全漏洞

请不要为疑似安全漏洞创建公开 Issue。请使用本仓库的 GitHub 私密漏洞报告入口：

`https://github.com/NaCr05/skill-atlas/security/advisories/new`

请说明受影响版本或提交、复现步骤、影响范围以及最小验证示例，并移除 API Key、非公开 Skill 内容、个人路径和无关用户数据。我们计划在七天内确认收到报告，后续调查和修复时间将取决于严重程度与可复现性。

需要特别关注的安全区域包括路径穿越保护、本地文件读取、GitHub Skill 审查与安装、拒绝覆盖和写入边界、浏览器本地数据，以及可选 API 凭据和联网功能。

Skill Atlas 不需要你的 Codex 账户密码。请勿在 Issue、Discussion、截图或个人备注中提供任何密钥。
