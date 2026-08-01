# Public screenshots

These images are generated from the deterministic fixtures under `tests/fixtures`; they do not contain the maintainer's personal paths, installed Skill inventory, notes, tokens, or private repository data.

- `dashboard-desktop.png`: Chinese default compact inventory on desktop.
- `dashboard-desktop-en.png`: English default compact inventory on desktop.
- `dashboard-mobile-top.png`: initial 390 × 844 mobile viewport.
- `dashboard-mobile.png`: full mobile inventory for responsive review.
- `marketplace-desktop.png`: English marketplace and safe-install entry.
- `detail-desktop.png`: English Skill detail and provenance view.

Regenerate them from a production build with:

```powershell
npm run build
npm run screenshots
```

The capture configuration points the app at fixture-only Codex, user-profile, and plugin directories and performs a fixture marker check before writing screenshots. These files are documentation assets and are not loaded by the application at runtime, except where referenced by the README.
