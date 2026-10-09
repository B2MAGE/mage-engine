# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Scope
MAGE is a browser-based music visualizer engine/library built with Three.js + Shader Park and bundled with Vite.

## Read First
- `README.md`
- `package.json`
- `scripts/build-package.mjs`
- `docs/maintained-engine.md`
- `js/mage-lib.js` (public library entrypoint)
- `js/MAGEEngine.js` (main orchestration)
- `js/MAGEVisualizer.js` (shader/geometry flow)
- `js/MAGEFx.js` (post-processing pipeline)
- `schema.js` (preset schema shape)

## Working Commands
- Install pinned deps: `npm ci`
- Dev server (after build): `npx vite`
- Build package: `npm run build`
- Verify source and production package behavior: `npm test`
- Generate the release tarball: `npm pack`

Notes:
- `npm test` rebuilds first and must pass. The unchanged upstream audio diagnostic has known failures documented in `docs/maintained-engine.md`.
- Vite dev server is configured for port `5173` with strict port mode.

## Architecture Boundaries
- `js/mage-lib.js` exports `initMAGE(...)` and is the package entrypoint.
- `js/MAGEEngine.js` owns lifecycle, scene/camera/renderer, audio wiring, input bridges, and hooks.
- `js/MAGEVisualizer.js` handles generated shader logic and sculpture updates.
- `js/MAGEFx.js` manages post-processing effects and ordering.
- `js/MAGEPreset.js` defines preset serialization/deserialization behavior.
- `js/MAGEPresetDock.js` handles preset dock UI behavior.
- `scripts/build-package.mjs` is the package build pipeline; `types/` owns the public declaration surface.
- Untrusted source is evaluated only in the consuming application's disposable compiler worker; renderer calls use `loadCompiledPreset` with validated inert data.

## Generated Files And Edit Rules
- Do not hand-edit `js/presets.js` or `js/skyboxes.js`; they are generated.
- Source of truth for generated presets is `resources/presets/**/preset.v2.json` (or fallback `preset.json`).
- Source of truth for embedded skyboxes is `resources/skyboxes/**` with all 6 required faces.
- Presets are embedded by eager Vite imports. `js/skyboxes.js` is the existing embedded skybox module.
- `js/compiled-shader-shell.generated.js` is generated from literal strings in the pinned ShaderPark dependency; never hand-edit it.
- Do not patch `node_modules`, hand-edit `dist`, or scrape compiled engine functions to maintain behavior. Keep logic in source modules.
- `dist/*` artifacts are build outputs; regenerate instead of manual edits.

## Conventions
- Core classes use `MAGE*` naming.
- `MAGEEngine` uses ES private fields (`#field`) heavily.
- Prefer extending existing module boundaries over introducing new cross-cutting utility files.
- Keep public API changes centered around `js/mage-lib.js` and package exports.

## Validation Checklist For Code Changes
- Run `npm run build` after JS/API/build-pipeline changes.
- If touching preset/skybox generation, verify regenerated `js/presets.js` and/or `js/skyboxes.js` are produced.
- If changing runtime behavior, run `npx vite` and sanity-check in browser.

## Known Pitfalls
- `js/index.js` imports `./controls.js`; treat `js/mage-lib.js` + `MAGEEngine` as the library-first integration path.
- Shader complexity can be GPU-heavy; avoid assuming smooth mobile performance.
- For dispose/lifecycle changes in `MAGEEngine`, ensure render-loop teardown remains safe (cancel frame + no post-dispose null access).

## Documentation Links
- Main usage and behavior notes: [README](./README.md)
- Preset schema sample: [schema.js](./schema.js)
- Maintained build and release workflow: [guide](./docs/maintained-engine.md)
