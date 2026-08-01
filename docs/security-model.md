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

No shell command from a downloaded Skill is run.

## Local web controls

The supplied scripts bind the server to `127.0.0.1`. Mutating and credential-using POST routes accept only `localhost`, `127.0.0.1`, or IPv6 loopback Host/Origin values to reduce cross-site requests and DNS rebinding exposure.

This remains a local developer tool, not a hardened multi-user server. Do not expose its port through a proxy, tunnel, port-forward, or firewall rule.

## Secrets

Keys are read per request from server environment variables, never returned by the settings page, and never written to a Skill. `.env*` files are ignored except `.env.example`. Logs and errors must not include raw response headers or tokens.

## Browser-local personal data

Task recommendation is deterministic and runs in the browser. Favorites, pins, notes, recent copies, zero-result queries, and copy timings are stored only in versioned browser `localStorage`; they are not sent to the Next.js server or external marketplaces. Notes are limited to 4,000 characters, query text to 160 characters, recent copies to 20, and metric streams to 100 events each. The dashboard provides a clear-local-data action. Anyone with access to the same browser profile can read this data, so users should not place secrets in task descriptions or notes.

## Residual risks

- A reviewed Skill may contain malicious natural-language instructions even when it has no scripts.
- GitHub content could change between tree inspection and blob download. Blob URLs are content-addressed and byte sizes are rechecked, reducing but not eliminating upstream trust concerns.
- In-memory plans are process-local. Multi-process deployment is unsupported and outside the local MVP.
- Static extension-based script detection is advisory, not malware analysis.
- A local process running under the same user can modify Skill files independently of this app.
- Browser-local notes and task descriptions are not encrypted and inherit the security boundary of the current browser profile.

## Dependency posture

Next.js 16.2.12 pins older PostCSS and optional Sharp versions. The repository uses npm overrides for patched PostCSS 8.5.25 and Sharp 0.35.3, both of which are also compatible with the newer Next.js line. Keep `npm audit` in release checks and remove the overrides once a stable Next.js version depends on patched releases directly.
