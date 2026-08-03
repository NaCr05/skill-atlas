# Changelog

Notable changes to Skill Atlas will be documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/NaCr05/skill-atlas/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/NaCr05/skill-atlas/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NaCr05/skill-atlas/releases/tag/v0.1.0
