# Skill Atlas

[简体中文](README.zh-CN.md)

**Know which Codex Skill to use, why it fits, and how to invoke it.**

[![CI](https://github.com/NaCr05/skill-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/NaCr05/skill-atlas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-f5b942.svg)](LICENSE)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5fa04e)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-4b72ff)

Skill Atlas is a Windows-first, local control panel for discovering, understanding, and safely using the Codex Skills already available on your computer. It turns a growing collection of Skill folders into a searchable workspace with practical invocation Prompts, readiness checks, relationships, and a review-before-install flow.

![Skill Atlas dashboard](artifacts/dashboard-desktop-en.png)

## Why Skill Atlas?

As your Skill collection grows, remembering every Skill's purpose, trigger rules, dependencies, and source becomes difficult. Skill Atlas keeps those details visible and helps you move from “What should I use?” to a copyable Prompt without editing the installed Skill itself.

| Need | What Skill Atlas provides |
| --- | --- |
| Find the right Skill | Search by name, capability, tag, or describe a task in natural language. |
| Know whether it works | Separate structural validity, invocation policy, and environment readiness. |
| Invoke it correctly | Generate an editable Prompt in the selected interface language. |
| Build a personal workspace | Favorite, pin, annotate, and revisit recently copied Skills. |
| Understand provenance | Inspect source folders, supporting files, dependencies, and related Skills. |
| Discover new Skills | Search SkillsMP and review a complete GitHub Skill tree before installation. |

## Quick start

Requirements: Windows 10/11, Node.js 20 or newer, and npm.

The following commands work in both PowerShell and Command Prompt (CMD):

```text
git clone https://github.com/NaCr05/skill-atlas.git
cd skill-atlas
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), then:

1. Select **Rescan** to read the current local inventory.
2. Describe a task or search for a Skill.
3. Open a result, review its rules, and select **Copy invocation Prompt**.
4. Paste the Prompt into Codex and add the details of your task.

For terminal identification, CMD and PowerShell environment-variable syntax, troubleshooting, and production mode, see the [complete quick-start guide](docs/quick-start.md).

## What it scans

Skill Atlas treats the filesystem as the source of truth and recognizes:

- personal Skills in `%CODEX_HOME%\skills` or `%USERPROFILE%\.codex\skills`;
- Codex system Skills under `.system`;
- the currently active version of plugin-provided Skills;
- compatible `.agents` and skill-manager shared directories as read-only sources.

Stale plugin-cache releases are hidden. Compatibility and shared directories remain read-only. Inferred descriptions, translations, and AI output are never written back to an installed `SKILL.md`.

## Optional integrations

The local inventory, task recommendation, and default Prompt flow require no API key. Copy `.env.example` to `.env.local` only when you want an optional integration.

| Variable | Purpose | Required? |
| --- | --- | --- |
| `SKILLSMP_API_KEY` | Higher SkillsMP search quota | No |
| `VERCEL_OIDC_TOKEN` | Official skills.sh API access | No |
| `GITHUB_TOKEN` | Higher GitHub API limits for public repositories | No |
| `OPENAI_API_KEY` and `OPENAI_MODEL` | Optional personalized Prompt enhancement | No |

Every optional service degrades to a local or link-based fallback. Never commit `.env.local` or paste secrets into personal notes.

## Safety and privacy

- The app binds to `127.0.0.1` by default and has no user account or cloud sync.
- A GitHub-hosted Skill is inspected before installation, including its full file tree, scripts, metadata, size, and blocking risks.
- Installation requires confirmation, targets only the resolved Codex Skills directory, refuses overwrites, and never executes downloaded scripts.
- Favorites, notes, recent copies, and lightweight usage metrics stay in browser-local storage.

Read the [security model](docs/security-model.md) before changing filesystem or installer behavior. Report vulnerabilities through the process in [SECURITY.md](SECURITY.md).

## Development

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Useful project guides:

- [Quick start](docs/quick-start.md)
- [Architecture](docs/architecture.md)
- [Development workflow](docs/development.md)
- [Security model](docs/security-model.md)
- [Testing strategy](docs/testing.md)
- [Contributing](CONTRIBUTING.md)

## Current scope

The first public version focuses on Codex and Windows. It does not update or permanently delete Skills, execute Codex automatically, synchronize data to the cloud, or manage user accounts. Claude-compatible sources and macOS support are possible future directions, not current guarantees.

## Contributing and license

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.

Released under the [MIT License](LICENSE). Copyright © 2026 NaCr05.
