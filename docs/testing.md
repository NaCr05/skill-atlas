# Testing strategy

## Required gates

| Command | Gate |
| --- | --- |
| `npm run typecheck` | Strict TypeScript contracts compile |
| `npm run lint` | Next.js and React rules pass |
| `npm run test` | Unit and integration behavior passes |
| `npm run build` | Production server and routes compile |
| `npm run test:e2e` | Critical Chromium flows pass |
| `npm run package:windows:stage` | Build the allowlisted standalone Windows application directory |
| `npm run verify:windows-stage` | Start the bundled Node runtime and require an HTTP 200 response |

`npm run verify` runs the first four gates in sequence.

## Fixture coverage

The checked-in Codex home includes an automatically invocable Skill, explicit-only Skill with `agents/openai.yaml`, missing dependency, malformed metadata, and personal/system duplicate. It never points at the user's real Skills during automated browser tests.

Additional isolated fixtures verify that only the active plugin version is included, remote plugin markers are honored, stale/inactive cache entries are excluded, structural and environment states remain independent, the 30-second inventory cache can be invalidated, and relationship ranking favors explicit/shared metadata over generic wording. Dependency regressions verify that prose `$skill-name` references remain non-blocking and fenced PowerShell or shell variables such as `$dest` and `$source` never become Skill dependencies.

Unit tests also cover Chinese and English Prompt selection, deterministic OpenAI/DeepSeek provider resolution, both provider request shapes, trigger/language validation, local fallback on missing configuration or provider failure, the no-cross-provider-failover rule, encrypted runtime-setting persistence, key preservation and explicit clearing, DPAPI round-tripping on Windows, bilingual task recommendation, no-match behavior, corrupted local-state recovery, zero-result deduplication, bounded local persistence, task/search-history validation, unsafe stored-link removal, and median copy-journey calculation.

The on-demand AI suite additionally verifies bounded untrusted context, duplicate usage-ID handling, exclusion of personal note bodies, exact installed-Skill validation, grounded market candidate IDs, installed-only complement names, deterministic Chinese composition Prompt construction, blocked-install authority, one-attempt provider failure, and no network request when configuration is absent. Marketplace-selection tests cover installed/duplicate removal, same-name collapse, provider ID namespacing, leaderboard relevance, and result bounds. Browser tests intercept marketplace, inspection, confirmation, and advisory endpoints and assert that local recommendation makes zero calls, marketplace search does not call AI, AI ranking requires its own click, both install entries open the same review checkpoint, confirmation remains disabled until human acknowledgement, and success actions do not trigger AI.

Startup coverage verifies launcher option parsing, missing-dependency repair commands, Windows browser command construction, and fallback from an occupied preferred port. Windows integration tests execute both root launchers from a different working directory and simulate a PATH without Node.js to verify the copyable installation command. Runtime-diagnostic unit tests ensure ready and action-needed states remain distinct and read-only.

## Security and installation coverage

The GitHub API is mocked at the core boundary. The integration test performs the complete review and confirmation flow, writes a nested asset and script into a temporary Codex home, verifies their bytes, and then removes only the temporary test directory. Separate cases block traversal and an existing target.

Lifecycle tests calculate deterministic full-directory fingerprints, compare mocked GitHub blob identities, verify added/modified/removed classifications, disclose script and metadata risks, and assert that previewing never writes upstream files into the installed Skill. Source-confirmation coverage verifies the short-lived plan, external registry record, inventory refresh, and local-divergence warning after a tracked file changes.

Lifecycle integration tests use newly created temporary Codex homes. They verify complete-directory movement, source-record archival, stable IDs after restore, hard-dependency blocking, time-of-check/time-of-use fingerprint drift, simulated post-move rollback, and restore collision refusal. Safe-update tests verify staged download, old-version retention, final fingerprint/provenance, and rollback after an injected post-install failure. Disable tests prove disappearance from discovery, in-place enable, and rollback after an injected move failure. Recovery tests cover intact-quarantine repair, orphan-staging cleanup, and fingerprint-proven failed-update rollback. Permanent-deletion cases retain exact-name, one-use, drift, isolation, audit, and quarantine rollback coverage.

Operations coverage verifies pure duplicate/dependency issue planning, manageable-source precedence, compatibility-only migration candidates, complete-directory archive, restore, purge, rollback, and incomplete-final-audit reporting; all-tracked upstream status caching and post-update cache reconciliation; repository trust evidence and source locks; successful/failed/interrupted operation records; and rejection of tampered operation kinds. Browser coverage exercises batch selection without automatic mutation, one-item duplicate review, the visual archive list, missing-dependency marketplace handoff, resolved and remaining post-install rescans, batch upstream checking, sequential per-item update review, the updates-available state, and operation recovery links.

Management coverage verifies strict/advisory source-policy evaluation, semantic app-version comparison, API-key exclusion from portable data, merge-only import review, phase-level operation records, committed-backup eligibility, exact-name cleanup confirmation, purge quarantine, distribution asset presence, the Backups & Archives route, settings panels, and an explicitly clicked update check. The Windows stage test uses the copied `runtime/node.exe` rather than the developer's PATH entry.

`LIVE_GITHUB_TEST=1` enables a separate smoke test against OpenAI's public `define-goal` directory. It installs into a newly created temporary Codex home, verifies `SKILL.md`, and removes the isolated directory afterward. It is skipped by the normal offline suite so network outages cannot make local verification flaky.

## Performance budget

An integration test creates 500 minimal Skill directories and requires `discoverSkills().durationMs < 5000`. The timer measures discovery and classification, not fixture creation. This is a broad Windows MVP budget, not a microbenchmark.

## Browser coverage

Playwright runs against `127.0.0.1:3178` with `CODEX_HOME` set to the fixture. It covers inventory visibility, structure/environment labels, manual rescanning, task recommendation, grounded uninstalled marketplace discovery, explicit AI market ranking, direct review-and-install entry from both surfaces, post-install Prompt copy and inventory focus, dependency-repair rescans, recoverable removal, dedicated Trash navigation, one-click restore, guarded permanent deletion, the Operations Center issue/archive/update queues and interrupted recovery link, batch upstream results, zero-result metrics, favorites, pins, notes, recent copies, task-history replay without a second AI request, marketplace-result replay without a second search, Chinese Prompt composition, local-state persistence, detail navigation, the lifecycle panel and local fingerprint, the Settings environment health check, unconfigured AI-provider state, page-based DeepSeek setup, refresh persistence and secret non-disclosure, skills.sh's credential-free degraded state, and a 390 px viewport overflow check.

The `pretest:e2e` hook creates a production build before Playwright starts the localhost server. This avoids Windows development-worker behavior and validates the actual production route bundle.

Before a release, also inspect desktop and mobile screenshots for clipped paths, inaccessible dialogs, overflow, and source/status color semantics. Automated tests do not replace visual review.
