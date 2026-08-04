# Windows distribution

Skill Atlas supports two Windows delivery paths:

- source launchers for contributors (`start-skill-atlas.cmd` and `start-skill-atlas.ps1`);
- a per-user Inno Setup installer that bundles the Next.js standalone server and the Node.js executable used for the build.

## Build locally

Install Inno Setup 6, ensure `ISCC.exe` is available, then run:

```powershell
npm ci
npm run package:windows
```

The installer is written to `dist/windows/installer`. To validate only the standalone application stage without Inno Setup, run `npm run package:windows:stage`; the result is under `dist/windows/app`.

## Release automation

Pushing a `v*` tag or manually running the **Windows installer** workflow builds on `windows-latest`, installs Inno Setup, and uploads the `.exe` as a workflow artifact. Tag builds also attach the installer to the matching GitHub Release automatically.

## Runtime behavior

The shortcut launches a hidden VBS entry point, which starts the bundled Node runtime. The desktop launcher reuses a running Skill Atlas instance on port 3180 or selects the next free port up to 3199, waits for readiness, then opens the local browser URL. Logs are stored under `%LOCALAPPDATA%\Skill Atlas\launcher.log`.

The in-app update control calls the GitHub latest-release API only when selected. Installing a newer package replaces application files but does not remove personal Skills or data under `CODEX_HOME/.skill-atlas`.
