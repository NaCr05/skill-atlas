# Testing strategy

## Required gates

| Command | Gate |
| --- | --- |
| `npm run typecheck` | Strict TypeScript contracts compile |
| `npm run lint` | Next.js and React rules pass |
| `npm run test` | Unit and integration behavior passes |
| `npm run build` | Production server and routes compile |
| `npm run test:e2e` | Critical Chromium flows pass |

`npm run verify` runs the first four gates in sequence.

## Fixture coverage

The checked-in Codex home includes an automatically invocable Skill, explicit-only Skill with `agents/openai.yaml`, missing dependency, malformed metadata, and personal/system duplicate. It never points at the user's real Skills during automated browser tests.

Additional isolated fixtures verify that only the active plugin version is included, remote plugin markers are honored, stale/inactive cache entries are excluded, structural and environment states remain independent, the 30-second inventory cache can be invalidated, and relationship ranking favors explicit/shared metadata over generic wording.

Unit tests also cover Chinese and English Prompt selection, bilingual task recommendation, no-match behavior, corrupted local-state recovery, zero-result deduplication, bounded local persistence, and median copy-journey calculation.

Startup coverage verifies launcher option parsing, missing-dependency repair commands, Windows browser command construction, and fallback from an occupied preferred port. Windows integration tests execute both root launchers from a different working directory and simulate a PATH without Node.js to verify the copyable installation command. Runtime-diagnostic unit tests ensure ready and action-needed states remain distinct and read-only.

## Security and installation coverage

The GitHub API is mocked at the core boundary. The integration test performs the complete review and confirmation flow, writes a nested asset and script into a temporary Codex home, verifies their bytes, and then removes only the temporary test directory. Separate cases block traversal and an existing target.

`LIVE_GITHUB_TEST=1` enables a separate smoke test against OpenAI's public `define-goal` directory. It installs into a newly created temporary Codex home, verifies `SKILL.md`, and removes the isolated directory afterward. It is skipped by the normal offline suite so network outages cannot make local verification flaky.

## Performance budget

An integration test creates 500 minimal Skill directories and requires `discoverSkills().durationMs < 5000`. The timer measures discovery and classification, not fixture creation. This is a broad Windows MVP budget, not a microbenchmark.

## Browser coverage

Playwright runs against `127.0.0.1:3178` with `CODEX_HOME` set to the fixture. It covers inventory visibility, structure/environment labels, manual rescanning, task recommendation, zero-result metrics, favorites, pins, notes, recent copies, Chinese Prompt composition, local-state persistence, detail navigation, the Settings environment health check, skills.sh's credential-free degraded state, and a 390 px viewport overflow check.

The `pretest:e2e` hook creates a production build before Playwright starts the localhost server. This avoids Windows development-worker behavior and validates the actual production route bundle.

Before a release, also inspect desktop and mobile screenshots for clipped paths, inaccessible dialogs, overflow, and source/status color semantics. Automated tests do not replace visual review.
