# Changelog

Notable changes to Skill Atlas will be documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A browser-local Prompt recipe library for saving and directly reusing a Skill, task, custom requirements, and language without re-entering them.
- Saved ordered multi-Skill workflows with deterministic combined-Prompt generation, manual reordering, missing-Skill detection, and an explicit no-auto-execution boundary.
- Copy-outcome feedback for **Helpful**, **Not solved**, and **Wrong Skill**, stored as bounded local aggregates and used to refine deterministic recommendations without storing or uploading conversation text.
- A compact capability imprint in the invocation Builder showing source and author, structural validity, environment readiness, invocation mode, dependencies, recent use, and the active recommendation reason.
- A dedicated bilingual **Recipes & flows** workspace, with recipe/workflow editing, reuse counts, backup/export coverage, and responsive layouts.

### Fixed

- Source and packaged Windows launchers now verify the Skill Atlas identity response before opening a browser, so another local web app on port 3000 cannot be mistaken for Skill Atlas; the quick-start guide also distinguishes updating an existing clone from creating a new one and no longer links to a fixed port.

## [0.2.0] - 2026-08-06

### Added

- A catalog-first home page with one bilingual command for exact lookup and task matching, action-oriented health buckets, a desktop filter/results/Builder workspace, a medium-screen drawer, and a mobile bottom sheet.
- Keyboard navigation for catalog recommendations, responsive filter dismissal, and invocation dialogs with focus trapping and restoration.
- Bounded 20-item catalog pagination, with deterministic 500/1,000-Skill performance coverage.
- Responsive regression coverage for 1440px, 768px, and 360px layouts in Chinese and English.

- Phase-by-phase operation details for preflight, download, backup, replacement, verification, rollback, and completion, streamed into an accessible details drawer.
- A Backups & Archives workspace with storage totals, update-backup and disabled-Skill inventory, recovery handoffs, and fingerprint-verified reviewed cleanup.
- Configurable source governance for trusted authors/repositories, advisory or strict trust rules, SPDX license allowlists, archived-repository warnings, and source-lock filters.
- Secret-free JSON export and reviewed merge import for browser preferences, notes, discovery history, operations, source registry, AI model selection, and source policy, with a pre-import private snapshot.
- A standalone Windows distribution, Inno Setup installer recipe, desktop/Start-menu shortcuts, tag-driven GitHub installer workflow, and manually triggered in-app release check.

- Deterministic full-directory fingerprints for installed and GitHub-hosted Skills.
- A local source registry that records exact upstream provenance without modifying installed `SKILL.md` files.
- Read-only upstream update previews with added, modified, removed, and unchanged file lists.
- Risk signals for scripts, metadata changes, invalid sources, unsupported entries, safety limits, and local divergence.
- Installation review now shows the upstream tree revision and reviewed fingerprint, and successful installs record provenance automatically.
- Optional Prompt enhancement through either OpenAI Responses or DeepSeek Chat Completions, with deterministic provider selection shown in Environment Settings.
- A bilingual in-page AI connection console with Windows DPAPI-protected credential persistence, immediate activation, refresh/restart persistence, and environment-variable restore.
- Six explicitly triggered AI advisory flows: installed-Skill recommendation, grounded market-candidate ranking, multi-Skill composition, installation explanation, update-difference summary, and personal usage assistance.
- Task-based marketplace discovery with installed/duplicate filtering, separate AI ranking, clear uninstalled states, and review-before-install handoff.
- Unified **Review and install** entry from marketplace results and task candidates, with a shared deterministic review checkpoint and mandatory human confirmation.
- Post-install actions to focus the newly installed Skill or copy its deterministic invocation Prompt.
- Copyable, deterministic multi-Skill Prompts built from schema-validated AI plans without automatically invoking Codex.
- Browser-local recent task and marketplace search history, including result replay across navigation without silently repeating AI or marketplace requests.
- Recoverable personal-Skill removal with deterministic dependency review, one-use confirmation plans, complete-directory fingerprints, a private local trash, source-record archival, immediate undo, and later restore.
- Persistent lifecycle transaction journals and automatic rollback when a removal or restore fails after files have moved.
- A dedicated bilingual Trash workspace with original/current path visibility, storage totals, one-click restore, and per-Skill permanent deletion behind a fresh review and exact-name confirmation.
- A read-only lifecycle reconciliation and recovery center for corrupt trash records, orphaned purge quarantine directories, failed transactions, and stale intermediate journals.
- A shared accessible dialog boundary with initial focus, trapped Tab navigation, Escape dismissal, focus restoration, scroll containment, and mutation-safe close locking.
- Summary-only inventory and graph payloads; full `SKILL.md` instructions now load only for one Skill at a time.
- A shared bounded, expiring, one-use review-plan store for installation, source tracking, removal, and permanent deletion.
- Stable localized API error codes for installation, update, lifecycle, Prompt, and rescan flows.
- Latest-request-wins coordination for task AI, market discovery, market search, ranking, and installation review requests.
- Layered frontend styles with design tokens, base rules, shared component styles, route-level styles, feature layers, and late theme/i18n overrides.
- An Operations Center that batches duplicate/dependency review planning, checks all tracked upstream sources, and consolidates running, successful, and failed lifecycle records with recovery links.
- Individually reviewed migration of redundant compatibility-directory entries into a verified private archive with transaction journaling and rollback.
- Installation source-trust evidence covering repository author, commit recency, license, activity, version summary, and the exact repository/ref/revision/fingerprint lock.
- An **Updates available** local-inventory filter backed by the bounded batch-check cache.
- A visual duplicate-migration archive with verified original-location restore and separately reviewed permanent cleanup.
- A sequential batch-update queue that refreshes each diff and requires confirmation for every atomic update.
- Live Operations Center progress over local SSE, plus automatic interruption marking for records orphaned by a previous process.
- Dependency-repair closure that forces a post-install inventory scan and reports either resolved or remaining dependencies.
- Catalog-backed Chinese descriptions plus deterministic local summaries for newly installed or previously unknown Skills, with explicit provenance labels and the original `SKILL.md` retained for verification.
- A shared path renderer used across details, settings, installation, updates, operations, storage, and trash so Windows and repository paths wrap only at directory separators.

### Fixed

- The invocation Builder now opens only after an explicit Skill selection; its content scrolls independently while the copy action remains visible at the bottom of a 1440 × 900 viewport.
- Tablet navigation now uses a keyboard-accessible menu instead of a clipped horizontal strip.
- The 360px catalog compresses secondary chrome and keeps personal usage insights collapsed, placing the first Skill at approximately 450px from the viewport top.
- Catalog rendering no longer mounts every matching Skill at once, preventing multi-thousand-pixel pages for large inventories.

- Public screenshot capture now targets the catalog home page and selects a deterministic fixture Skill instead of waiting for a graph-only layout control.
- Trash-page responsive styles no longer hide labels or change navigation columns across unrelated mobile pages.

- Hard Skill dependencies now come only from structured `dependencies.skills` declarations; prose references remain non-blocking relationships.
- Fenced shell and PowerShell variables such as `$dest` are no longer misclassified as missing Skills.
- Missing-dependency labels and diagnostics now identify the exact required Skill.
- Missing AI configuration and provider request failures now preserve the deterministic local Prompt; failures never trigger a silent cross-provider request.
- Permanent deletion now reports final audit-journal failure explicitly instead of returning an audit ID that may not have been committed.
- Tampered operation-log entries with unknown action kinds are ignored instead of reaching the UI.
- Migration-archive cleanup now separates byte deletion from final audit persistence and surfaces incomplete audit evidence explicitly.
- Mostly-English metadata containing a few Chinese brand characters is no longer mistaken for a complete Chinese description.
- Suspicious replacement or mojibake characters are reported as an encoding problem instead of being displayed as trusted Skill metadata.

### Security

- Update previews are short-lived, bounded, localhost-only, and explicitly incapable of replacing, disabling, deleting, or executing Skill files.
- External models are never called by page load, typing, local recommendation, scanning, or review generation. Personal note bodies are excluded, response schemas are validated, and AI advice cannot override deterministic blockers.
- Marketplace AI results are grounded to exact IDs from the preceding search and exact installed complement names; invented references are rejected.
- Removal is restricted to direct personal manageable Skill directories, revalidates real paths and fingerprints at confirmation, blocks broken hard dependencies, and never executes bundled scripts. Permanent deletion is restricted to revalidated direct private-trash records, uses a separate one-use plan and atomic quarantine, and never targets active Skill directories.

## [0.1.1] - 2026-08-03

### Added

- One-command CMD and PowerShell launchers with project, Node.js, npm, dependency, and port preflight checks.
- Automatic free-port fallback, server-readiness polling, and browser opening.
- A read-only Environment health check with explicit ready/action states and shell-specific repair commands.
- Windows regression coverage for both launchers, missing Node.js, missing dependencies, and occupied ports.

### Fixed

- Quick-start instructions now distinguish CMD and PowerShell, keep users inside the cloned project, and document PowerShell execution-policy recovery.
- The corrected bilingual project documentation is included in the release source tag.

## [0.1.0] - 2026-08-02

### Added

- Windows-first local inventory for personal, system, active plugin, compatibility, and shared Codex Skills.
- Separate structural, invocation, and environment-readiness signals.
- Bilingual Chinese and English interface with language-matched invocation Prompts.
- Task-description recommendations, search, relationships, favorites, pins, notes, and recent copies.
- Review-before-install workflow for GitHub-hosted Skills.
- Optional SkillsMP, skills.sh, GitHub, and OpenAI integrations with graceful fallback.
- Bilingual project documentation and GitHub community health files for the first public preview.

[Unreleased]: https://github.com/NaCr05/skill-atlas/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/NaCr05/skill-atlas/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/NaCr05/skill-atlas/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NaCr05/skill-atlas/releases/tag/v0.1.0
