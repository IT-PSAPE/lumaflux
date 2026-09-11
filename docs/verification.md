# Verification record

Verified on Apple Silicon macOS with Node 24 and Electron 44.3.0. The shipped UI follows the user's Webflow density reference and uses pink accents.

## Requirement evidence

| Requirement | Implementation | Verification |
| --- | --- | --- |
| Electron / React / Base UI / Tailwind | `src/electron`, `src/renderer`, Vite and esbuild configuration | Typecheck, production build, packaged app launch |
| Three-panel dense workspace, pink accent | `App.tsx`, `style.css`, `DESIGN.md` | Actual Electron screenshots at 1440×960 and 1060×700, viewport overflow check |
| Import / folder navigation / gallery / selection | `PhotoService.importPaths`, gallery/sidebar | Core directory/corruption/dedup tests, native-dialog-driven Electron import and selection |
| Foundational tonal/color adjustments | Shared recipe and image processing stage | Pixel comparisons, exact linear-light EV test, neutral identity and alpha tests; real UI slider edit |
| Crop / rotation / flip / straighten / viewing | `Viewer.tsx`, `render.ts` | Geometry fixture dimensions and EXIF tests; real crop/rotate/compare/zoom/1:1 controls |
| Nondestructive editing and undo/redo | Serialized catalog, recipes, per-photo revisions | Source byte comparisons; stale patch rejection; atomic batch validation; UI undo/redo |
| Copy/paste and selection synchronization | `Adjustments.tsx`, command layer | Electron workflow verifies paste preserves geometry and sync applies adjustments |
| Batch export | `ExportManager` | Decoded outputs, dimensions, unique collision paths, cancellation and missing-source tests; native app batch export |
| Persistent catalog and relink | Atomic catalog file, relink command | Save-failure regression; actual app relaunch preserves history/ratings/favorites; moved original detected and relinked |
| Local MCP | Official SDK HTTP endpoint and bundled stdio adapter | Real clients discover tools/resources, edit, preview, subscribe/unsubscribe, receive updates; agent edits reflected in UI |
| Agent boundary | Loopback binding, token, roots, IPC sender checks | Unauthorized and Origin rejection, path traversal/symlink containment tests; renderer sandbox/context isolation in runtime config |
| Worker rendering and preview scheduling | Two-worker pool and latest-preview queue | Concurrent real worker decoding; closed-worker rejection; superseded-draft scheduling test |
| Runnable local app | Electron builder output | `release/mac-arm64/Lumaflux.app`; full workflow run against packaged executable |

## Review dispositions

A separate read-only review inspected catalog, exports, MCP, and Electron lifecycle. The settings-update/shutdown race was accepted and corrected using a serialized settings queue that shutdown awaits. Catalog temporary files are cleaned after failed saves.

The reported live-reference leak in `state()` was rejected: `structuredClone` wraps the complete returned object, including jobs. The suggestion to replace an atomic settings rename with a fallback copy was rejected because it weakens atomicity; save errors are surfaced to callers. External processes can still replace referenced originals independently of the app's mutation lock; originals are referenced, not copied into a private vault. That storage behavior is documented.

The final audit added tests/fixes for Zod defaults resetting unrelated patch values and MCP resource subscription handlers. It also corrected notification pointer interception and viewport overflow at minimum window size.

## Scope limits

Standard raster inputs, 8-bit sRGB processing, no camera RAW development or advanced masks/layers. Export job history is session-only. Release 0.10.0.1 packaging and packaged-app workflows are verified on Windows x64, Ubuntu Linux x64, macOS Intel, and macOS Apple Silicon. Local build is unsigned and not notarized. Production dependency audit reported no known vulnerabilities at verification time. Large-catalog and maximum-size performance has not been benchmarked.

## Reproduce

```sh
npm run typecheck
npm test
npm run test:e2e
npm run package
LUMAFLUX_EXECUTABLE="$PWD/release/mac-arm64/Lumaflux.app/Contents/MacOS/Lumaflux" node scripts/e2e.mjs
```

Electron tests use generated color-study fixtures, not user photos. Screenshots and test catalogs are local verification artifacts; test photos are not imported into the user's normal library.

## Workspace revision — 10 September 2026

The updated workspace has separate Adjustments, Composition, and Info tabs, a single viewer toolbar, automatic crop handles with aspect locking, side-by-side original/edited comparison, an inward-cropping straighten algorithm, a filesystem folder browser, and persistent resizable panel widths. Library panels are hidden by default and editing hides file navigation.

42 unit/integration tests pass, including opaque rotation bounds for portrait/landscape images at positive/negative angles through 45 degrees, quarter turns, and all eight locked crop handles at extreme drags. The Electron workflow additionally checks hidden panels, real folder traversal, keyboard panel resizing, isolated Info content, automatic crop handles, distinct comparison images, 1:1 viewing, MCP synchronization, batch export, persistence, and relinking.

The complete revised workflow also passed against the rebuilt `release/mac-arm64/Lumaflux.app`, including the straighten slider and relaunch/relink checks. Screenshots include `composition.png`, `compare.png`, and the minimum-size `compact.png`.

## Sidebar restoration and preview latency

Restored the persistent Library sidebar; Edit still hides it. Removed the duplicate library bottom strip and local-save wording. Undo/redo/reset now occupy the viewer toolbar, and filename/dimensions are available in Info.

The original synthetic 6000×4000 JPEG benchmark (seven changing exposure renders, 5° straighten, 1600px output) measured a warm median of 1121 ms. With bounded source/geometry caches and channel lookup tables, the same scenario measured 58 ms (about 19× faster); first render was 435 ms. These are local renderer timings, not an end-to-end latency guarantee or a benchmark of complex real photos. The reproducible benchmark is `scripts/benchmark-preview.ts --preview` via tsx.

The canvas no longer debounces until dragging pauses or rerenders crop-only changes in Composition. It shows completed frames while coalescing pending requests and rejects frames belonging to another photo/view. Canvas work takes priority over queued thumbnails. Per worker, decoded source caches are bounded to 64 MiB and geometry caches to 32 MiB; full-resolution view and export bypass preview downsampling.

44 tests cover previous behavior plus cache byte limits, eviction, source replacement invalidation, and pixel isolation across cached edits. The Electron workflow confirms a changed canvas image while the slider pointer is still held, the restored sidebar, toolbar history controls, crop/compare, MCP edits, exports, and relaunch/relink.

The same complete desktop workflow passed against the rebuilt packaged app after this performance revision, including live slider feedback before pointer release and source-byte preservation after export.

## Public release 0.10.0.1

- Repository: https://github.com/IT-PSAPE/lumaflux
- Release: https://github.com/IT-PSAPE/lumaflux/releases/tag/v0.10.0.1
- Successful workflow: https://github.com/IT-PSAPE/lumaflux/actions/runs/34460405320
- Released source: `5f3fc1350347a0dcdf9a0b5cd05d3ddf12d05145`
- All four matrix jobs passed type checking, 45 tests, packaging, and the complete packaged-app smoke workflow. The version and publishing jobs also passed. No CI repairs were needed in this run.
- Published Windows x64 NSIS installer; macOS arm64/x64 DMG and ZIP; Linux x64 AppImage and Debian package. Verified all seven download digests against the published `SHA256SUMS.txt` using GitHub's asset digest metadata.
- Release is public, not a draft; its tag points to the verified source commit. Updating the root `release.yaml` version on main triggers the next release.

## Lens correction and noise reduction

Pulled upstream main through `2fc6fa4` before implementation, retaining its RAW support. Added manual lens distortion, corner illumination, red/blue chromatic alignment, and independent luminance/color denoising. See `docs/lens-and-denoising.md` for processing order and scope.

All 54 tests pass, including noise/error reduction and edge-preservation fixtures, legacy defaults, alpha safety, original preservation, correction cache invalidation, small-image preview/export agreement, history persistence, and MCP access. The Electron workflow exercises the new controls with the existing crop, comparison, zoom, agent, export, and relink flows. Screenshots include `lens-correction.png` and `denoising.png`.

The rebuilt Apple Silicon desktop app also passed `node scripts/release-smoke.mjs`, including noise-copy/lens-exclusion checks and relaunch/relink. No new public release was created for this local feature addition.

## Interactive RGB histogram

Added a compact histogram above the inspector tabs with overlapping RGB distributions, draggable tone regions, channel clipping indicators and overlays, J toggling, and hovered-pixel RGB percentages. Statistics reuse the displayed preview and follow composition crops without an additional backend render. See `docs/histogram.md` for sampling and color-space details.

All 57 tests and TypeScript checks pass. The rebuilt Apple Silicon app passed `node scripts/release-smoke.mjs`, including histogram placement, exposure-driven graph updates, drag input, clipping toggle/overlay pixels, RGB readout, and the existing edit/export/MCP/relaunch workflow. Visually checked `output/playwright/histogram.png`. No public release was created.

## Auto correction and photographic agent workflow

Added metadata-matched Lensfun calibration snapshots, individual Light Auto, measured reference-tone suggestions, candidate/original/uncropped MCP previews, and a bundled professional photography skill exposed through MCP instructions/tool/resource/prompt. Source research, limitations, data provenance, and license separation are documented in `docs/auto-editing-research.md` and `data/lensfun/README.md`.

65 unit/integration tests pass. Coverage includes retained JPEG EXIF, missing/unknown metadata, calibrated sampling and alpha, original-byte preservation, history/persistence, stale-revision rejection, reference adaptation rather than copied recipes, deterministic Auto, transparent input, and new MCP discovery/preview operations. Type checking, the Electron workflow, packaging, and the complete packaged-app smoke test pass on Apple Silicon macOS. The desktop workflow clicks both Auto buttons, removes the applied profile, and retains crop/compare/agent/export/relink behavior. `auto-light.png` and `auto-lens.png` were inspected locally. Packaged Lensfun notices/license and the installable skill are present.

A local 1000×750 synthetic profile render measured about 124 ms after reducing inner-loop allocations (previous implementation: 362 ms). This is a local timing, not a full-resolution or end-to-end latency guarantee. No new release version was requested or published.
