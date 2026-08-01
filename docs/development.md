# Development guide

## Setup

```powershell
npm ci
npm run dev
```

The project requires Next.js 16 conventions. Route and page `params` are promises. Before changing framework-sensitive behavior, consult the local guides under `node_modules/next/dist/docs` as required by `AGENTS.md`.

## Repository map

| Area | Responsibility |
| --- | --- |
| `src/app` | Pages and validated HTTP handlers |
| `src/components` | Client interactions and reusable UI |
| `src/core/skills` | Filesystem inventory and Prompt rules |
| `src/core/marketplaces` | External discovery adapters |
| `src/core/installer` | Review, confirmation, download, and verification |
| `src/core/security` | Local request guard |
| `tests/fixtures` | Deterministic Codex home used by browser tests |
| `tests/unit` | Pure parsing, path, Prompt, provider, and request behavior |
| `tests/integration` | Inventory and installation workflows |
| `tests/e2e` | Browser-critical user journeys |
| `scripts/screenshots` | Fixture-only public screenshot capture |

## Change rules

- Preserve `127.0.0.1` in `dev` and `start` scripts.
- Do not add direct write operations outside `src/core/installer` without revisiting the security model.
- Treat `SKILL.md`, YAML, marketplace payloads, GitHub paths, and downloaded bytes as untrusted.
- Keep base functionality deterministic and offline. New AI features must be optional, labeled, and degradable.
- Add a provider behind the `MarketplaceResponse` contract instead of exposing provider-specific response shapes to UI components.
- Keep the installer two-step. Inspection must not write files; confirmation must consume a server-held plan and recheck the target.
- Keep public screenshots fixture-only. `npm run screenshots` starts the built app against `tests/fixtures` and refuses to use a non-fixture inventory.

## Adding a new status

Update `SkillStatus`, discovery classification, the status label, CSS color semantics, fixture coverage, and any filter options together. Prefer a secondary marker when the original usability status remains valuable.

## Adding a source

Define its root and permission in `resolveCodexEnvironment`, choose direct or bounded recursive discovery, document its authority, and add a fixture. New writable sources are outside the current MVP and require explicit product approval.

## Updating public screenshots

Build first, then run the dedicated fixture capture:

```powershell
npm run build
npm run screenshots
```

The capture uses a separate local port and deterministic test directories. Review every resulting file under `artifacts/` before committing it.
