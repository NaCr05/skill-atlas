# Architecture diagram sources

These diagrams describe implemented behavior, with matching English and Chinese views. The overview is a compact system map; the invocation flow follows one installed Skill through local Prompt preparation and manual handoff to Codex. Management transactions and other AI advisory actions are intentionally outside the invocation view; see the [full architecture](../architecture.md).

| View | Editable sources | Generated images |
| --- | --- | --- |
| System overview | [English](overview.en.architecture.json), [中文](overview.zh-CN.architecture.json) | `artifacts/diagrams/overview.<locale>.{svg,png,dark.png}` |
| Invocation flow | [English](invocation.en.workflow.json), [中文](invocation.zh-CN.workflow.json) | `artifacts/diagrams/invocation.<locale>.{svg,png,dark.png}` |

`<locale>` is `en` or `zh-CN`. README `<picture>` elements select a dark PNG when the reader prefers a dark theme. PNG is the stable reading surface; SVG retains scalable geometry and text. Open an image at full size for its smaller annotations.

## Source evidence

The initial source baseline is [Skill Atlas `fc98b4263580077a87f1f633666f4bd78b3e678f`](https://github.com/NaCr05/skill-atlas/tree/fc98b4263580077a87f1f633666f4bd78b3e678f). Overview JSON includes this revision and per-component file references. Workflow evidence is recorded below because its schema does not accept repository metadata.

| Diagram IDs | Behavior represented | Source and verification |
| --- | --- | --- |
| `skill_files`, `scan` | Resolve local roots and read installed Skills without rewriting their instructions. | [paths](../../src/core/skills/paths.ts), [discovery](../../src/core/skills/discover.ts), [discovery tests](../../tests/integration/discovery.test.ts) |
| `inventory`, `summarize` | Supply summary inventory without full instruction bodies. | [catalog entry](../../src/components/catalog-page.tsx), [inventory model](../architecture.md#inventory-model) |
| `workbench`, `select_skill`, `base_prompt` | Filter/select locally and generate a deterministic bilingual Prompt in the browser. | [catalog client](../../src/components/dashboard-client.tsx), [Builder](../../src/components/invocation-builder.tsx), [Prompt tests](../../tests/unit/prompt.test.ts) |
| `ai_gateway`, `request_ai`, `enhance_or_fallback`, `ai_provider` | An explicit enhancement click calls the local route, reads server-side configuration, optionally calls one provider, validates output, and falls back locally. | [Prompt route](../../src/app/api/prompt/route.ts), [provider and fallback](../../src/core/skills/prompt.ts), [AI tests](../../tests/e2e/ai-assist.spec.ts) |
| `ready_gate`, `fix_readiness`, `copy_prompt`, `paste_codex`, `codex` | Readiness gates copy and AI enhancement; successful copying records local usage. The user starts a separate Codex task. | [Builder](../../src/components/invocation-builder.tsx), [health buckets](../../src/core/skills/catalog.ts), [local copy records](../../src/core/local-workspace.ts) |
| `skill_sources`, `reviewed_changes` | External source inspection and separately reviewed installation/lifecycle changes. This overview groups several management flows. | [security model](../security-model.md), [lifecycle guide](../skill-lifecycle.md), [detailed system map](../architecture.md#detailed-system-map) |

The fallback node is a **local service**, not an external model. A missing configuration or failed request does not silently try another provider. The last node is a **manual handoff**, not proof that Codex has executed anything. Neither diagram describes a RAG pipeline or autonomous agent loop.

## Reproduce the images

Authoring uses the original [Archify](https://github.com/tt-a1i/archify) package at revision [`a07fa1d5b2a10cbea110c5a2be2817397a301cdc`](https://github.com/tt-a1i/archify/tree/a07fa1d5b2a10cbea110c5a2be2817397a301cdc), package version `2.17.0-dev.1`. This exact development revision was used for its Windows support. Keep the complete upstream `archify/` directory; no local renderer changes or production dependency additions are needed. The original tool requires Node.js 18+; this project requires Node.js 20+.

With that package installed at the normal personal Skill path, run the following **from the Skill Atlas repository root**. Adjust only `$archifyRoot` if the complete package lives elsewhere. Chrome or Edge is needed for browser validation.

```powershell
$archifyRoot = Join-Path $env:USERPROFILE '.codex/skills/archify'
$archifyCli = Join-Path $archifyRoot 'bin/archify.mjs'
$diagramPreview = Join-Path $env:TEMP ('skill-atlas-diagrams-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $diagramPreview | Out-Null
$diagramSpecs = @(
    @{ Name = 'overview.en'; Type = 'architecture' },
    @{ Name = 'overview.zh-CN'; Type = 'architecture' },
    @{ Name = 'invocation.en'; Type = 'workflow' },
    @{ Name = 'invocation.zh-CN'; Type = 'workflow' }
)
foreach ($diagram in $diagramSpecs) {
    $spec = "docs/diagrams/$($diagram.Name).$($diagram.Type).json"
    $html = Join-Path $diagramPreview "$($diagram.Name).html"
    $evidenceArgs = @()
    if ($diagram.Type -eq 'architecture') { $evidenceArgs = @('--repo-root', (Get-Location).Path) }
    node $archifyCli validate $diagram.Type $spec --quality showcase --json @evidenceArgs
    if ($LASTEXITCODE -ne 0) { throw "Diagram validation failed: $spec" }
    node $archifyCli deliver $diagram.Type $spec $html --quality showcase --json @evidenceArgs
    if ($LASTEXITCODE -ne 0) { throw "Diagram delivery failed: $spec" }
    node $archifyCli visual-check $html --json
    if ($LASTEXITCODE -ne 0) { throw "Browser validation failed: $html" }
}
$diagramPreview
```

For each delivered HTML file:

1. Open it locally and review light and dark themes at all generated desktop sizes. Check arrows, label clearance, clipping, and source links. Automated success does not replace reading the rendered image.
2. In the viewer's **Export** menu, select the light theme and export SVG and PNG. Select the dark theme and export PNG again. Rename the three files to `<name>.svg`, `<name>.png`, and `<name>.dark.png`, using the `Name` values above, and place them in `artifacts/diagrams/`.
3. Inspect the resulting images inside both READMEs at approximately 960 px reading width. Keep the key flow collapsed by default and make sure the overview remains legible.
4. Include the JSON and corresponding images together. If source behavior changed, recheck the evidence table and update the pinned repository revision and affected references. Changing only the language or layout does not require pretending the source baseline changed.

Use the viewer's canonical export rather than a screenshot of its toolbar or selection state. Generated HTML and browser-check screenshots are review artifacts and need not enter the application repository. HTML is interactive locally; a Markdown image cannot provide its controls. Publishing an interactive viewer is a separate hosting decision.

## Maintenance and validation

- Keep IDs, relationships, boundaries, optional branches, and readiness rules identical between locales. Translate labels and annotations; allow measured layout differences for text length.
- Preserve the default local path, explicit external calls, local fallback, and manual Codex handoff when updating a diagram.
- Expect all nine showcase checks to pass with zero composition errors or warnings. Check the final delivered HTML after any JSON edit, then export from that same artifact.
- Rendering used the classic, static presentation. Generated PNG glyphs can differ with the operating system and font fallback, especially for Chinese; compare visual meaning and geometry rather than expecting cross-platform byte identity.
- Follow the [development guide](../development.md) and the repository's required checks. These are documentation assets; the normal app build and CI do not run Archify.

Archify's MIT license and bundled font/third-party notices are preserved under [artifacts/diagrams/licenses](../../artifacts/diagrams/licenses). The notices are copied from the pinned upstream package and may describe assets not used in these diagrams.
