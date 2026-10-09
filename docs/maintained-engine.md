# Maintained engine package

The portfolio frontend consumes `@b2mage/mage-engine` from this fork's versioned GitHub Release asset. Its existing `@notrac/mage` dependency name is an import alias. The fork is `private: true` to prevent accidental registry publication; building and packing still work. Do not publish under the upstream npm namespace.

## Source and upstream

This first source release merges original engine main `10d446b13d178815d4f3e33910b974f1ddb13404` (upstream package 1.0.4). The original `bsiscoe/MAGE` URL now redirects to `arson-i-x/MAGE`. The merge preserves the fork's history. Future upstream updates should also be reviewed merges, not resets or force pushes.

The behavior baseline is the frontend's patched `@notrac/mage@1.0.3` at frontend commit `20605c7`. The patch has been moved into these source boundaries:

| Behavior | Maintained source |
| --- | --- |
| Render resolution, pixel ratio, frame and raymarch budgets; bounded thumbnails; lifecycle notifications; stale audio cleanup | `js/MAGEEngine.js` |
| Live camera, scene, effects and motion changes without replacing shaders or resetting playback | `js/live-settings.js`, `MAGEEngine.updateSettings` |
| Pure compiled-artifact validation, GLSL scaffold validation and bounded program settings | `js/compiled-shader.js` |
| ShaderPark source evaluation and finite iteration ceiling | `js/compiler.js`, `js/shader-park-compiler.js` |
| Three material construction and inert compiled scene loading | `js/sculpture.js`, `js/MAGEVisualizer.js` |
| Sample-driven audio analysis, async session cancellation and deterministic audio-time mappings | `js/audio-analysis.js`, `js/audio-mapping.js`, `js/audio-response.js` |
| Audio configuration persistence | `js/MAGEPreset.js` |
| Effect ordering and render target allocation | `js/MAGEFx.js`, `js/effects/AfterimagePass.js` |
| Public API types | `types/` |

The current legacy, transient-v1 and mapped-v1 audio modes are all retained. Removing compatibility modes is separate work. Upstream preview audio fields retain their initial defaults, and the fork's public `stop()` lifecycle method remains available.

## Build and verification

Use Node 22.13 or newer compatible with Vite 8. From a fresh checkout:

```sh
npm ci
npm test
node scripts/test_generated_shader_parse.cjs
npm pack
```

`npm test` rebuilds first. `npm pack` also rebuilds and emits `b2mage-mage-engine-1.0.4-mage.1.tgz`. No install/prepare hook runs in the consuming frontend, and the tarball requires no runtime npm dependencies.

`scripts/build-package.mjs` is the package build entrypoint. It builds the engine and a separate compiler entry, copies source-owned shared modules and declarations, and includes dependency licenses. It reads six static GLSL scaffold strings from the pinned ShaderPark dependency because that dependency does not export them; extraction accepts literal strings only and fails if the dependency shape changes. It never rewrites `node_modules` or extracts JavaScript functions from a compiled engine bundle.

`dist/` and `js/compiled-shader-shell.generated.js` are generated. Source compiler imports point to the maintained adapter; the packaged compiler entry points to the generated self-contained compiler. The distribution retains the existing filenames needed by the frontend's worker allowlist.

The regression suite checks:

- All 16 existing scene fixtures produce byte-identical GLSL and uniforms to the baseline at iteration ceilings 32, 96 and 200. Retired templates remain test fixtures only.
- Production consumer bundling with minification preserves helpers such as `box`, `torus`, `cylinder` and `setStepSize`, which ShaderPark invokes dynamically.
- Compiled mesh creation never executes the supplied source metadata; tampered compiled programs and executable properties are rejected.
- Live settings validate the entire update before state changes.
- Audio analysis is independent of block size, mappings are independent of render frequency, and disposed async audio sessions cannot reconnect.
- Render budgets and all existing audio modes survive the packaged entrypoint.

The original `scripts/test_audio_analysis.cjs` currently fails three expectations against unchanged upstream source: its 64-bin bass fixture misses the defined bass band, and it expects an `audioState` argument to alter a generator that does not read that argument. `npm run test:upstream` retains this diagnostic. These failures also occur on the merged upstream baseline; this release does not change those audio/generation algorithms to satisfy stale expectations. The active sample-driven audio path has separate passing behavior tests above.

## Compilation and runtime boundary

`compileShader` evaluates ShaderPark source as JavaScript. It is **not a sandbox**. Untrusted source must run in the application's disposable compiler worker, with the application's timeouts and termination policy. Keep compiler bundling tree shaking disabled: helper functions are referenced through dynamic evaluation. Production rebundling is tested, but a consumer that removes the lexical helper environment can still break compilation.

The renderer receives validated data and calls `loadCompiledPreset`; source text there is inert metadata. `loadPreset` with raw source remains an API for trusted local content. Do not route user source through that API. Browser isolation, origin/CSP restrictions, worker termination and cross-window protocol validation remain the consuming application's responsibilities. Engine render budgets bound workload; they cannot guarantee that a GPU driver will never stall.

## Release procedure

1. Commit and review the source plus lockfile, run the checks above, and complete frontend production/runtime verification with the local tarball.
2. Merge into this fork, tag the reviewed commit as `v1.0.4-mage.1`, then rebuild and pack that exact commit with `npm ci`.
3. Attach the tarball to the fork's GitHub Release. Never replace an already consumed asset; use a new version for any changed bytes.
4. Pin the frontend dependency to the complete release asset URL and commit the resulting lockfile integrity. Remove the old engine patch only after consumer tests pass.

The package is intentionally not published to npm. The lockfile integrity and immutable release version identify the exact engine the frontend uses.
