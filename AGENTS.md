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
- Deterministic Prompt generation must work without any AI key. Label AI-enhanced content and fall back safely when the provider is unavailable.
- External marketplaces are optional adapters. Their failure must not block local inventory, detail, or Prompt flows.
- Required verification before handoff: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e`.
