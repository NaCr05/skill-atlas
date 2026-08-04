<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Skill Atlas repository contract

- This application is Windows-first and local-only. Keep development and production scripts bound to `127.0.0.1`.
- The filesystem is the source of truth. Never rewrite an installed `SKILL.md` to store inferred metadata.
- New installations may target only the resolved `CODEX_HOME/skills` directory. Existing targets must never be overwritten.
- System, plugin, `.agents`, and skill-manager shared sources are read-only in this MVP.
- Treat marketplace responses and Skill content as untrusted data. Validate request bodies, GitHub paths, file counts, file sizes, links, and submodules.
- Installation requires a review step and a separate, short-lived confirmation plan. Downloading files must never execute their scripts.
- Update execution may mutate only a freshly revalidated direct personal/manageable Skill. Download reviewed Git blobs into private staging without execution, verify the reviewed target fingerprint, atomically preserve the old directory under private backups, replace by rename, verify again, and roll back on any failure. Never overwrite an unrelated target.
- Fingerprint comparisons must cover the complete bounded Skill directory. Removal, restore, disable, and enable may mutate only direct personal/manageable Skill directories through short-lived review plans, private lifecycle roots, transaction journals, post-move verification, target-conflict refusal, and automatic rollback. Permanent deletion may target only a revalidated direct record inside the private Skill Atlas trash; it requires a separate one-use plan, exact-name confirmation, atomic quarantine, and an audit transaction. Automatic or bulk trash cleanup is out of scope.
- Lifecycle readers must reconcile corrupt trash records, purge-quarantine leftovers, orphaned update staging, and failed or stale transaction journals without silently hiding them. Recovery actions accept issue IDs only, rerun reconciliation, and execute only actions proven safe by current paths and fingerprints. Byte deletion and final audit persistence are separate outcomes and must be reported separately.
- Modal dialogs must use the shared accessible boundary: focus enters on open, Tab remains contained, Escape closes when no mutation is active, and focus returns to the connected trigger.
- Deterministic Prompt generation must work without any AI key. Label AI-enhanced content and fall back safely when the provider is unavailable.
- External AI calls must require an explicit user click. Page load, typing, local search, scanning, and deterministic recommendation must never trigger a provider request. AI advice cannot override deterministic installation or lifecycle blockers.
- External marketplaces are optional adapters. Their failure must not block local inventory, detail, or Prompt flows.
- Market candidates remain explicitly uninstalled: filter installed and duplicate entries, ground AI advice to exact search-result IDs, and require the existing review flow before any installation.
- Inventory and graph surfaces may receive only `SkillSummary`; full Skill instructions belong to the single-Skill detail boundary.
- User-visible API failures must return a stable `code` and a message localized from that code. Never pass raw core exception text directly to the client.
- Mutating review flows must use the shared bounded, expiring, one-use review-plan store. Do not add route-specific global plan maps.
- Batch issue selection and batch upstream checks are read-only planning boundaries. Never turn a multi-selection into implicit filesystem mutation; every duplicate migration, dependency installation, or update still needs its own review authority.
- A batch-update queue may coordinate only one fresh preview and one explicit confirmation at a time. It must never reuse batch-check preview authority, pre-confirm later items, or continue through a failed mutation without showing the result.
- Duplicate-migration archives may be restored only to their verified configured compatibility location with collision refusal. Permanent cleanup requires a separate one-use plan, exact-name confirmation, private quarantine, fingerprint validation, and separate byte-deletion/final-audit reporting.
- Dependency repair may prefill marketplace discovery but must never auto-search or auto-install. After an explicit installation, force a fresh inventory scan and report resolved or remaining dependency evidence.
- Repository activity, author, license, and popularity are advisory only. Installation authority is the locked repository/ref/tree revision plus the complete staged fingerprint.
- Operation-log records improve visibility but are not recovery authority. Keep lifecycle journals, manifests, path constraints, and fingerprints authoritative, and ignore unknown/tampered operation kinds.
- Operation streaming must stay localhost-only and bounded. Running records owned by a previous process must become interrupted with a recovery link instead of remaining indefinitely active.
- Task- or query-dependent async UI work must use latest-request-wins coordination so an older completion cannot replace newer intent.
- Keep `src/app/globals.css` as the ordered stylesheet entry point. Put tokens, base rules, shared components, page styles, feature styles, theme overrides, and i18n overrides in their corresponding `src/styles` layers.
- Required verification before handoff: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e`.
