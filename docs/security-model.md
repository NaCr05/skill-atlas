# Security model

## Protected assets

- Existing Skills and their supporting files.
- The boundary of the resolved personal `CODEX_HOME/skills` directory.
- Local API keys and optional provider tokens.
- Browser-local task searches, personal notes, favorites, pins, and usage timings.
- The user's expectation that downloaded code is not executed during installation.

## Trust boundaries

Skill documents, YAML, GitHub repositories, provider responses, browser request bodies, Host headers, and Origin headers are untrusted. Marketplace rankings and third-party audits can inform a decision but are not installation authority.

## Installation controls

1. Only `https://github.com` public repository or exact tree URLs are accepted.
2. Owner, repository, optional Skill name, and all relative paths are validated.
3. A recursive Git tree is rejected if truncated, over 500 files, over 20 MB, or contains symlinks/submodules.
4. Executable extensions are disclosed as review risks.
5. The target is resolved from the current personal Skills root, checked for segment-aware containment, and blocked if it exists.
6. Inspection stores a short-lived opaque plan server-side and returns only review data.
7. Confirmation consumes that plan once, checks expiry and target again, downloads blobs into a contained staging directory, validates byte sizes and a non-empty `SKILL.md`, then atomically renames the directory.
8. On failure only the verified staging directory is removed. Existing Skill directories are never removed or overwritten.
9. Successful installation records content fingerprints and the reviewed source in the Skill Atlas registry. Registry failure is reported without rolling back an otherwise verified installation.
10. Repository owner, latest commit, license, archived state, activity, stars, and open issues are advisory evidence, not proof of safety. Missing optional GitHub metadata cannot weaken file-tree validation.
11. Confirmation is locked to the reviewed repository, ref, tree revision, and complete manifest fingerprint. Blob downloads are re-hashed in private staging before the target rename.
12. Optional source policy can require a trusted author or exact repository and an allowed SPDX license. Archived repositories remain visible as warnings. Policy cannot weaken tree, path, size, or fingerprint blockers.

## Backup, archive, and portability controls

1. Private storage inventory exposes only known lifecycle roots under `CODEX_HOME/.skill-atlas` and never treats active Skills as cleanup candidates.
2. Update backups are cleanable only when their manifest fingerprint matches and the related lifecycle transaction is final. Disabled Skills remain recoverable until the user starts a separate cleanup review.
3. Cleanup plans expire, are single-use, require the exact Skill name, revalidate the fingerprint, and atomically quarantine the direct container before deletion.
4. JSON exports omit encrypted and environment API keys. Import validates bounded data, shows record counts, saves a private pre-import snapshot, and merges rather than bulk-deleting current records.
5. The Windows installer is per-user, binds the bundled server to `127.0.0.1`, and keeps personal Skills and `.skill-atlas` data outside the application installation directory.
6. Upgrade checks are not automatic; GitHub is contacted only after the user clicks the update-check control.

## Batch planning and operation-log controls

1. Batch issue selection and batch upstream checking are read-only planning operations; they never imply permission to install, update, migrate, or delete.
2. Batch upstream checking is limited to three concurrent requests and includes only personal manageable Skills with an exact tracked source.
3. A compatibility duplicate can move only after a separate short-lived, one-use review validates the exact direct source directory, a surviving same-name entry, and a complete fingerprint.
4. Duplicate migration keeps the complete directory in private storage and verifies the archive. A post-move failure restores and re-fingerprints the original directory.
5. Missing-dependency repair is advisory: the user is sent to a marketplace search and must complete the normal source review and installation confirmation.
6. Operation records are bounded local UX evidence. Unknown/tampered operation kinds are ignored, and lifecycle transaction journals—not the log—remain authoritative for recovery.
7. Migration-archive restore accepts only a valid direct private archive and a configured compatibility target, refuses collisions, and verifies the restored fingerprint. Permanent archive cleanup has a separate one-use review, exact-name confirmation, quarantine, and independently reported final-audit outcome.
8. Batch update selection grants no shared mutation authority. Every queue item is freshly inspected and requires its own visible confirmation before the existing one-Skill atomic updater runs.
9. A dependency handoff never auto-installs. Only after a user-approved installation does the client request a forced rescan and display resolved/remaining evidence.
10. Operation streaming is localhost-only and transmits the same bounded records as the read API. Runtime ownership is used only to mark orphaned running records as interrupted; lifecycle journals remain authoritative.

No shell command from a downloaded Skill is run.

## Update-preview controls

1. Only personal, manageable Skills can establish source tracking. System, plugin, `.agents`, and shared sources remain read-only.
2. Existing Skills require an exact GitHub Skill directory and an explicit confirmation before provenance is recorded.
3. Local directories and remote Git trees are compared by normalized path, size, and content-addressed Git blob hash.
4. Symlinks, submodules, invalid metadata, name mismatches, truncated trees, more than 500 files, and more than 20 MB block source association.
5. New or changed scripts, changed `SKILL.md`, and local divergence are surfaced as review risks.
6. The preview API grants update capability only when deterministic blockers are absent. Confirmation downloads only reviewed blobs into private staging, never executes them, rechecks the local fingerprint, verifies the staged fingerprint, preserves the old version, and uses directory renames for replacement and rollback.
7. Source confirmation consumes a ten-minute plan and rechecks the local fingerprint to prevent time-of-check/time-of-use drift.
8. Provenance is stored outside the Skill in `CODEX_HOME/.skill-atlas/source-registry.json`, preserving the installed source tree.

## Recoverable removal controls

1. Only direct children of the resolved personal Skills root with personal/manage permission can enter the removal flow.
2. System, plugin, `.agents`, and shared Skills expose no removal action and are rejected again in the core lifecycle module.
3. Inspection uses a fresh inventory, lexical containment, real-path containment, ordinary-directory checks, and a complete bounded fingerprint.
4. Hard dependents are calculated after simulating removal. A structured dependency blocks the operation unless another active same-name Skill still satisfies it; prose references remain advisory.
5. Inspection returns a one-use ten-minute plan. Confirmation consumes it and rechecks permission, path, fingerprint, and directory state.
6. Removal atomically renames the complete directory into `CODEX_HOME/.skill-atlas/trash`; it never recursively deletes the installed Skill.
7. The trash copy is fingerprinted before commit. Source provenance moves from the active registry into the trash manifest.
8. Any failure after the move attempts an atomic rollback, restores source provenance, and verifies the original fingerprint.
9. Restore verifies the trash copy and refuses an occupied original target. It never overwrites an existing directory.
10. Permanent deletion starts a separate one-use review. It revalidates the manifest, direct private-trash transaction directory, ordinary-directory and real-path constraints, and complete fingerprint.
11. Confirmation requires an exact, case-sensitive Skill name. The reviewed transaction directory is atomically moved into `CODEX_HOME/.skill-atlas/purge` before recursive removal, so active Skill directories are never deletion targets.
12. A failed purge moves an intact quarantine back to trash. If recursive deletion has already changed the contents, automatic recovery is impossible and the failure journal identifies the remaining quarantine path.
13. Automatic, bulk, and scheduled trash cleanup are not available.
14. Trash reads also reconcile private trash, purge quarantine, update staging, and transaction roots. Invalid records are surfaced instead of being silently omitted.
15. A permanent deletion is not reported as fully audited unless the final `committed` transaction journal write succeeds. If bytes are already gone, the response explicitly distinguishes audit failure from deletion failure and the stale intermediate journal remains discoverable.
16. The recovery scanner never follows links or changes files automatically. Explicit recovery actions accept an opaque issue ID rather than a path, rerun the scan, and proceed only for an intact quarantine restore, an unreferenced old staging cleanup, or a transaction state whose original/backup fingerprints prove one deterministic outcome.

Removal review is deterministic and local. AI may not authorize, unblock, confirm, remove, restore, or permanently delete a Skill.

## Local web controls

The supplied scripts bind the server to `127.0.0.1`. Mutating and credential-using POST routes accept only `localhost`, `127.0.0.1`, or IPv6 loopback Host/Origin values to reduce cross-site requests and DNS rebinding exposure.

This remains a local developer tool, not a hardened multi-user server. Do not expose its port through a proxy, tunnel, port-forward, or firewall rule.

## Secrets

Keys can come from server environment variables or the localhost-only AI settings route. A key entered in the page is sent once to the local server over the loopback connection, encrypted with Windows DPAPI scoped to the current user, and stored in `CODEX_HOME/.skill-atlas/ai-settings.json`. It is never returned by an API, written to a Skill, logged, or placed in browser storage. The Settings page exposes only the selected provider, model name, readiness, key source, and missing variable names. `.env*` files are ignored except `.env.example`. Logs and errors must not include raw response headers, provider response bodies, or tokens.

AI Prompt enhancement sends the selected provider only the Skill name, Skill description, and local base Prompt, which may contain the task text typed into the Prompt dialog. The separate advisory endpoint supports task recommendation, grounded market-candidate ranking, Skill composition, installation explanation, update summary, and personal assistance with bounded action-specific payloads. Every provider request requires an explicit click, has one attempt, and never silently fails over to another provider. Provider responses never contain credentials and must pass strict schemas before display.

Skill documents, marketplace records, task text, file paths, risk descriptions, and provider responses are prompt-injection inputs, not instructions. The server supplies exact allowed Skill names and market candidate IDs and rejects invented references. AI cannot mark a market candidate as installed, add it to a composition, relax a deterministic install blocker, consume confirmation plans, write files, or claim that an update ran. Personal assistance excludes note bodies; it sends only selected Skill identifiers, bounded zero-result query text, and aggregate copy timing after the user clicks the entry.

DPAPI ciphertext can be decrypted only in the same Windows user context. It does not protect against malware or another process already running as that user. Clearing page-managed settings deletes the encrypted credential file and restores environment-variable configuration.

## Browser-local personal data

Local task recommendation is deterministic and runs in the browser. Favorites, pins, notes, recent copies, zero-result queries, and copy timings are stored in versioned browser `localStorage`; they are not sent to external marketplaces. Only the explicitly clicked personal-assistant action sends bounded Skill identifiers, query text, and timing aggregates to the configured AI provider. Notes are limited to 4,000 characters and are never included; query text is limited to 160 characters, recent copies to 20, and metric streams to 100 events each. The dashboard provides a clear-local-data action. Anyone with access to the same browser profile can read this data, so users should not place secrets in task descriptions or notes.

## Dialog accessibility boundary

All modal review and Prompt flows use the same keyboard boundary. Opening a dialog moves focus into it, Tab and Shift+Tab remain inside its enabled controls, Escape closes it when no filesystem mutation is in progress, and closing restores focus to the connected trigger. Destructive confirmation dialogs temporarily block dismissal while their mutation is running so a user cannot mistake a still-running operation for a cancelled one.

## Residual risks

- A reviewed Skill may contain malicious natural-language instructions even when it has no scripts.
- GitHub content could change between tree inspection and blob download. Blob URLs are content-addressed and byte sizes are rechecked, reducing but not eliminating upstream trust concerns.
- In-memory plans are process-local. Multi-process deployment is unsupported and outside the local MVP.
- Static extension-based script detection is advisory, not malware analysis.
- A local process running under the same user can modify Skill files independently of this app.
- The private Skill Atlas trash is recoverable local storage, not an encrypted backup. Another process running as the same user can modify or delete it.
- Permanent deletion is intentionally irreversible. Once recursive removal changes a quarantined directory, no rollback can recreate deleted bytes; users must inspect the exact path, size, and name confirmation before proceeding.
- A mutable Git branch can move after a preview, but confirmation uses the exact reviewed tree entries and content-addressed blob identities rather than resolving the branch again. Retained backups are local recoverability assets, not encrypted or off-device backups.
- Browser-local notes and task descriptions are not encrypted and inherit the security boundary of the current browser profile.

## Dependency posture

Next.js 16.2.12 pins older PostCSS and optional Sharp versions. The repository uses npm overrides for patched PostCSS 8.5.25 and Sharp 0.35.3, both of which are also compatible with the newer Next.js line. Keep `npm audit` in release checks and remove the overrides once a stable Next.js version depends on patched releases directly.
