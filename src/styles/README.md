# Style architecture

`src/app/globals.css` is only the ordered entry point. Keep additions in the
smallest applicable layer:

- `tokens.css`: semantic color, type, spacing, focus, and motion values.
- `base.css`: reset, document defaults, and accessibility primitives.
- `components/`: shared shell, inventory, dialog, and history patterns.
- `pages/`: route-owned layouts and feature presentation.
- `features/`: cross-page product features that are not generic primitives.
- `themes/` and `i18n.css`: late cascade overrides by design.

Preserve import order in `globals.css`; the dark theme and language layers must
remain after the structural page and component layers.
