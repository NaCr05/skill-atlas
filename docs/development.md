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
| `src/app` | Pages and validated HTTP handlers; `/` is the catalog, `/graph` is the capability graph, and `/skills` redirects to `/` |
| `src/components` | Client interactions and reusable UI, including the command surface, catalog filter rail, and responsive invocation Builder |
| `src/core/skills` | Filesystem inventory and Prompt rules |
| `src/core/marketplaces` | External discovery adapters |
| `src/core/installer` | GitHub installation review, confirmed staging, verification, and atomic installation |
| `src/core/review-plans` | Shared bounded, expiring, one-use review authority |
| `src/core/lifecycle` | Reviewed updates, remove/restore, disable/enable, private trash, transaction journals, and recovery |
| `src/core/issues` | Read-only issue planning and separately reviewed compatibility-entry migration |
| `src/core/storage` | Backup, disabled-Skill, and migration-archive accounting; reviewed cleanup |
| `src/core/operations` | Bounded progress and audit records; underlying journals and fingerprints remain recovery authority |
| `src/core/ai` | Optional provider routing and server-side encrypted settings |
| `src/core/local-workspace.ts`, `src/core/personal-library.ts` | Browser-local preferences, usage feedback, recipes, and composed Prompts |
| `src/core/security` | Local request guard |
| `src/core/environment` | Read-only runtime and filesystem readiness diagnostics |
| `tests/fixtures` | Deterministic Codex home used by browser tests |
| `tests/unit` | Pure parsing, path, Prompt, provider, and request behavior |
| `tests/integration` | Inventory and installation workflows |
| `tests/e2e` | Browser-critical user journeys |
| `tests/performance` | Bounded catalog search, grouping, and recommendation benchmarks |
| `docs/diagrams`, `artifacts/diagrams` | Editable architecture/flow sources and generated README images |
| `scripts/screenshots` | Fixture-only public screenshot capture |
| `scripts/startup` | Shared Windows launcher preflight, port selection, server start, and browser opening |

The root `start-skill-atlas.cmd` and `start-skill-atlas.ps1` files are deliberately thin wrappers. Keep startup rules in `scripts/startup/launcher.mjs` so the two entry points cannot drift. The Settings page uses the separate runtime-oriented `src/core/environment/diagnostics.ts` interface because an already-running server has different port semantics from a preflight launcher.

## Change rules

- Preserve `127.0.0.1` in `dev` and `start` scripts.
- Route filesystem mutations through the owning core boundary: installation in `installer`, lifecycle transactions in `lifecycle`, compatibility migration in `issues`, and reviewed storage cleanup in `storage`. Keep request handlers thin and reuse `review-plans`; consult the [security model](security-model.md) and [lifecycle contract](skill-lifecycle.md) before changing write authority. Operation logs report outcomes but cannot authorize a mutation or recovery.
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

The capture must enter the catalog through `/` and select a fixture Skill before recording the desktop Builder. Do not add assumptions about graph-only controls to the home-page capture; graph screenshots must navigate to `/graph` explicitly.

## Updating architecture diagrams

The English and Chinese READMEs share the same two views: a system overview and the single-Skill invocation flow. Edit the JSON sources in [docs/diagrams](diagrams/README.md), check the affected source and tests, then regenerate the matching SVG and light/dark PNG files under `artifacts/diagrams`. The diagram guide records the renderer revision, source revision, validation commands, and export procedure.

Keep node IDs, edges, boundaries, and readiness/fallback semantics aligned across languages. Review both themes at README reading width and keep the complete diagram sources with the generated images. When a change affects these boundaries, update the relevant README text and architecture explanation in the same change. Routine UI changes that do not affect the depicted behavior do not require diagram regeneration.

Archify is an optional documentation authoring tool, not an application dependency. Normal application builds and CI use the checked-in images and do not install or run it.
