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

The supported creative audio modes are Original (`legacy`) and Selective (`mapped-v1`). Version `1.0.4-mage.3` removes the retired `transient-v1` detector, analyser and external-envelope paths. Unsupported mode values throw instead of silently selecting Original; an omitted mode still selects Original. The existing Original amplitude/timing formula and Selective shared analysis/mappings are unchanged. The `legacy` identifier names the supported Original response, not obsolete behavior to remove. Upstream preview audio fields retain their initial defaults, and the fork's public `stop()` lifecycle method remains available.

Version `1.0.4-mage.4` adds an optional audio inspector spectrum using `AudioAnalysisSession.setSpectrumEnabled(true)` and `spectrum(audioContext.currentTime)` from the `audio-analysis` export. It is off by default. While enabled, the existing 2048-point FFT also supplies up to 36 low-to-high, approximately logarithmic RMS slices covering 40–8000 Hz (or Nyquist for lower sample rates). Each slice includes at least one distinct FFT bin; it does not claim resolution below the existing FFT. Aggregation and worklet transmission run at most 10 times per second, with no additional analyser or FFT and no changes to Original/Selective levels, hits or mapping timing. Values are linear RMS in `[0, 1]`, not decibels or an independently normalized loudness scale.

`spectrum(now)` returns `{ time, minHz, maxHz, values }` independently of `drain()`, or `null` while disabled, disconnected, warming up, or more than 0.5 seconds from the supplied audio clock. Reset and reconnect clear the cache while preserving the opt-in preference; disabling and disposal clear it immediately. Consumers should disable it when the inspector closes or playback stops. Simulated beats have no recorded waveform spectrum; consumers must show that state honestly rather than fabricate frequency bars.

## Build and verification

Use Node 22.13 or newer compatible with Vite 8. From a fresh checkout:

```sh
npm ci
npm test
node scripts/test_generated_shader_parse.cjs
npm pack
```

`npm test` rebuilds first. `npm pack` also rebuilds and emits `b2mage-mage-engine-1.0.4-mage.4.tgz`. No install/prepare hook runs in the consuming frontend, and the tarball requires no runtime npm dependencies.

`scripts/build-package.mjs` is the package build entrypoint. It builds the engine and a separate compiler entry, copies source-owned shared modules and declarations, and includes dependency licenses. It reads six static GLSL scaffold strings from the pinned ShaderPark dependency because that dependency does not export them; extraction accepts literal strings only and fails if the dependency shape changes. It never rewrites `node_modules` or extracts JavaScript functions from a compiled engine bundle.

`dist/` and `js/compiled-shader-shell.generated.js` are generated. The build replaces only the scaffold's known raymarch function with source-owned `js/raymarch.glsl`. A ray now reports a hit only after sampling the surface threshold. Exhausting the fixed iteration budget returns a miss, preventing conservative distance estimates for very thin shapes from shading a false full-height surface. This preserves the existing iteration and step-size budgets; difficult rays may remain transparent instead of drawing an unconfirmed hit. Both compiler and inert runtime validation consume the same generated scaffold. Source compiler imports point to the maintained adapter; the packaged compiler entry points to the generated self-contained compiler. The distribution retains the existing filenames needed by the frontend's worker allowlist.

The regression suite checks:

- All 16 existing scene fixtures preserve their GLSL and uniforms at iteration ceilings 32, 96 and 200, except for the deliberate shared raymarch termination change. Retired templates remain test fixtures only.
- The shipped raymarch loop returns hits for actual surfaces, including the last permitted sample, and misses when a ray escapes or exhausts its budget. Thin-shape conservative distances cannot become false surfaces.
- Production consumer bundling with minification preserves helpers such as `box`, `torus`, `cylinder` and `setStepSize`, which ShaderPark invokes dynamically.
- Compiled mesh creation never executes the supplied source metadata; tampered compiled programs and executable properties are rejected.
- Live settings validate the entire update before state changes.
- Audio analysis is independent of block size, mappings are independent of render frequency, and disposed async audio sessions cannot reconnect.
- Render budgets and Original/Selective audio modes survive the packaged entrypoint. Invalid and retired modes are rejected before changing the active response, settings, mappings or queued audio frames.
- Optional spectrum slices identify bass, mid and treble tones at 44.1/48 kHz and preserve stereo power. Enabling inspection changes neither response frames nor FFT counts; worklet messages are bounded to 10 Hz and stale data cannot survive a toggle, reset or reconnect.

The original `scripts/test_audio_analysis.cjs` currently fails three expectations against unchanged upstream source: its 64-bin bass fixture misses the defined bass band, and it expects an `audioState` argument to alter a generator that does not read that argument. `npm run test:upstream` retains this diagnostic. These failures also occur on the merged upstream baseline; this release does not change those audio/generation algorithms to satisfy stale expectations. The active sample-driven audio path has separate passing behavior tests above.

## Compilation and runtime boundary

`compileShader` evaluates ShaderPark source as JavaScript. It is **not a sandbox**. Untrusted source must run in the application's disposable compiler worker, with the application's timeouts and termination policy. Keep compiler bundling tree shaking disabled: helper functions are referenced through dynamic evaluation. Production rebundling is tested, but a consumer that removes the lexical helper environment can still break compilation.

The renderer receives validated data and calls `loadCompiledPreset`; source text there is inert metadata. `loadPreset` with raw source remains an API for trusted local content. Do not route user source through that API. Browser isolation, origin/CSP restrictions, worker termination and cross-window protocol validation remain the consuming application's responsibilities. Engine render budgets bound workload; they cannot guarantee that a GPU driver will never stall.

### Expanded shader workload policy v1 (PL-03)

`normalizeCompiledShader` independently estimates expanded GLSL computation before accepting an artifact. `analyzeCompiledShader` returns the same normalized artifact alongside a `ShaderWorkloadReport`; its report is diagnostic output only, never a trusted assertion from the compiler worker. The artifact shape has no budget field. The worker compiler, parent application, renderer, `loadCompiledPreset`, visualizer and final material-construction path each use normalization at their boundary. Calling the engine directly does not skip this check.

The estimate counts every syntactic call with multiplicity, follows the whole acyclic function graph, and charges repeated arithmetic tokens as well as intrinsic operations. Branches are summed conservatively. Scalar/vector/matrix built-ins have explicit costs and allowed arities; trigonometry and other expensive intrinsics cost more. The actual pinned scaffold bodies account for primitives, noise, lighting, shadows, occlusion and normal sampling. Same-name/same-arity helper overloads are summed rather than guessing a cheaper type overload. All authored functions are bounded, including unused functions.

The trusted raymarch loop uses the effective capped iteration count; reflection loops use the effective reflection count. Fixed trusted loops include up to ten fractal-noise samples, four spherical-distribution samples and eight occlusion samples. Loop syntax and the occlusion constant are asserted against the pinned scaffold, so an unsupported upstream change fails instead of silently reducing its estimate. This adds no scene-quality reduction: existing iteration, reflection and step-size normalization stays unchanged. Accepted GLSL, uniforms, Original and Selective audio behavior stay unchanged.

| Policy v1 limit | Maximum |
| --- | --- |
| Total authored GLSL tokens | 60,000 |
| Delimiter or conditional nesting | 64 |
| Authored function definitions | 512 |
| Call depth, including trusted helpers | 64 |
| Expanded cost of any authored function | 2,000,000 abstract work units |
| Expanded fragment cost, including trusted render loops | 80,000,000 abstract work units per pixel |

Existing serialized-artifact byte and uniform bounds still apply before tokenization. Iterative delimiter and graph traversals avoid JavaScript recursion; graph costs saturate at 80,000,001 before any multiplication or addition could grow into unsafe integers. No expanded source string or expanded call tree is constructed. Unknown calls, unsupported control constructs, recursive cycles (including cycles through trusted helpers), excessive nesting and excessive finite amplification are rejected before GPU submission. `ShaderWorkloadError` exposes a stable reason and, for exceeded limits, bounded actual/maximum values. Its wording identifies a limit without accusing the scene author of malicious behavior.

These are conservative weighted units, not GPU instruction counts or elapsed-time predictions. The engine's existing pixel, pixel-ratio and frame-rate budgets independently bound rendering dimensions and submission frequency; this estimate does not model device-specific speed, post-processing passes or GPU-driver defects. Passing validation is not a responsiveness guarantee.

`tests/fixtures/shader-workload.v1.json` commits accepted and rejected cases, including finite repeated-call chains that would overflow an unbounded estimator. Tests cover both-branch/diamond expansion, noise and overload accounting, configured iterations/reflections, parser bounds and rejection before any material or mesh work. The separate compiler-parity suite continues checking unchanged output for all 16 historical fixtures at 32/96/200 iterations. Consumer compatibility additionally measures all 14 current templates, authored and preview Builder forms, maximum rendering settings and boundary Builder designs; its versioned corpus and measured validation timings live in the frontend repository. No current catalog template is excepted from this policy. New limits or exceptions require a versioned policy and explicit compatibility results.

## Release procedure

1. Commit and review the source plus lockfile, run the checks above, and complete frontend production/runtime verification with the local tarball.
2. Merge into this fork, tag the reviewed commit using the package version (currently `v1.0.4-mage.4`), then rebuild and pack that exact commit with `npm ci`.
3. Attach the tarball to the fork's GitHub Release. Never replace an already consumed asset; use a new version for any changed bytes.
4. Pin the frontend dependency to the complete release asset URL and commit the resulting lockfile integrity. Remove the old engine patch only after consumer tests pass.

The package is intentionally not published to npm. The lockfile integrity and immutable release version identify the exact engine the frontend uses.
