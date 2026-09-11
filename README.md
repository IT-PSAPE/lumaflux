# Lumaflux

A local Electron photo editor with a compact React / Base UI / Tailwind interface and MCP access for local agents. All editing is nondestructive: the catalog stores recipes and history; original files are never written.

## Run

Use Node.js 22 or newer (verified with Node 24 on Apple Silicon macOS).

```sh
npm install
npm run dev
```

`dev` builds and opens Electron. After changing source, restart it to rebuild. Alternatively use `npm run build` followed by `npm start`.

```sh
npm run package
```

On this Mac, the local application is generated at `release/mac-arm64/Lumaflux.app`. It is an unsigned local build, not a notarized distribution. The published release workflow builds Windows, macOS, and Linux; local feature checks here use Apple Silicon macOS.

## Photo workflow

- Import files, multiple files, folders, or drag files/folders into the window. Supported: JPEG, PNG, WebP, single-page TIFF, and camera RAW (including DNG, CR2/CR3, NEF/NRW, ARW, RAF, ORF, RW2 and PEF). References stay in their original folders.
- Browse the gallery by folder, filename, favorites, or minimum star rating. Sort by name, file modification date, or rating. Change thumbnail density at the bottom.
- Click to select, Command/Ctrl-click to toggle selection, Shift-click for a range. Double-click to edit; the filmstrip navigates between photos.
- Adjust exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, tint, hue, saturation, vibrance, sharpening, and vignette. Click an adjustment's number to reset that control.
- Use the Composition tab to rotate, flip, straighten, and resize the always-visible crop frame with its eight handles. Lock its aspect ratio or choose a preset. Straightening automatically crops inward to keep the result inside the image. Geometry changes clear the previous crop. Compare shows the untouched original beside the edited result. Fit, zoom, 1:1, and drag-to-pan are available in the viewer.
- Undo/redo retains up to 100 committed changes per photo across launches. Copy/paste and “Apply to selected photos” transfer light/color/detail adjustments while preserving each photo's geometry.
- Export the selected batch as JPEG, PNG, or WebP, optionally resized. Jobs show progress, outputs, and individual errors. Cancel stops remaining work. Existing outputs get unique filenames. Export history is session-only.
- If an original moves, choose “Relink original file” in File information. Missing files are detected when the catalog opens.

Keyboard: `G` library, `E` editor, arrow keys navigate, Command/Ctrl+A select visible photos, Command/Ctrl+Z undo, Shift+Command/Ctrl+Z redo. Shortcuts do not intercept text fields or dialogs.

## Local agents / MCP

1. Open **Agents** in the top bar.
2. Agent access is always enabled while Lumaflux is running. Add allowed import/export folders.
3. Copy the client configuration into an MCP-compatible agent. Keep Lumaflux running.

The copied configuration uses `node` and a bundled stdio adapter. The packaged adapter is outside `app.asar` and can run independently of the development checkout. The adapter reads an owner-only connection file containing the loopback endpoint and a per-launch token. Credentials are not included in the copied JSON.

The app hosts authenticated Streamable HTTP on a dynamic `127.0.0.1` port. Direct HTTP clients may use the same connection file and a `Bearer` authorization header. Browser origins are rejected. The endpoint starts automatically on every launch, including first launch and previously disabled settings. Quitting Lumaflux closes it and removes the connection file. Idle HTTP sessions expire after 30 minutes; clients can initialize a new session. MCP does not launch a second catalog writer.

Tools:

| Workflow | Tools |
| --- | --- |
| Discover | `get_capabilities`, `get_app_state`, `list_photos`, `get_photo`, `get_recipe`, `get_selection` |
| Organize | `import_photos`, `set_selection`, `update_metadata` |
| Edit | `apply_edits`, `apply_batch_edits`, `reset_edits`, `undo`, `redo` |
| Inspect | `get_preview` returns JPEG image content and recipe revision |
| Export | `export_photos`, `get_export_job`, `cancel_export_job` |

Read resources at `lumaflux://app/state` and `lumaflux://photos/{id}`. Direct HTTP sessions receive app-state resource update notifications. The stdio adapter supports tools and resource reads.

Edits require an explicit photo ID and `expectedRevision`. Read the photo first, then submit only the fields to change:

```json
{
  "id": "photo-id-from-list-photos",
  "expectedRevision": 3,
  "patch": { "exposure": 0.5, "saturation": -10 }
}
```

If another agent or the UI changes the photo, the request returns `CONFLICT`; read again before retrying. Batch edits are atomic. Import and export results may partially succeed. Each export snapshots its recipes when queued. No tool deletes or overwrites an original.

The enabled agent can inspect and edit the imported library. Allowed folders constrain new filesystem imports and export destinations; they are not per-photo read permissions. Only connect agents you trust with your photo catalog. With no allowed folders, agents can inspect and edit imported photos, but new filesystem imports and exports are denied.

## Storage and image processing

The catalog and settings live in Electron's user-data directory (`~/Library/Application Support/lumaflux` on macOS development builds; the packaged product may use `Lumaflux`). `LUMAFLUX_DATA_DIR` overrides it for isolated testing. Catalog writes are serialized and atomically renamed. The previous catalog remains intact if writing fails. A single-instance lock prevents competing app writers.

Rendering uses Sharp and a shared pixel stage in two worker threads. Preview requests coalesce to the newest waiting draft; thumbnails have a bounded in-memory cache. Originals are oriented from EXIF, transformed, cropped, converted to sRGB, adjusted, and encoded. Exposure operates in linear light. Temperature/tint are relative artistic controls; positive tint adds magenta. Crops are normalized in the transformed image coordinates.

Current limits: 80 million input pixels, 10,000 files per import scan, 500 photos per edit/export batch, 16 simultaneous HTTP agent sessions. The first release processes raster channels at 8-bit precision and exports sRGB without EXIF/GPS metadata. RAW files are developed locally with LibRaw using camera white balance, full-resolution demosaicing, and sRGB output before entering the existing 8-bit editing pipeline. RAW originals remain untouched; export produces JPEG, PNG or WebP, not a modified RAW file. Temperature/tint remain relative artistic controls, not sensor-level white balance. Camera and compression support depends on the bundled LibRaw build; unsupported or damaged files report individual import errors. RAW input is limited to 512 MB and 80 million sensor pixels. Layers, masks, healing, and Lightroom catalog compatibility are not included. Large-catalog performance beyond these bounds has not been benchmarked.

## Verification

```sh
npm run typecheck
npm test
npm run test:e2e
npm run package
```

Tests use generated fixtures, temporary catalogs, decoded output files, original byte comparisons, real worker threads, and real MCP clients. The Electron workflow covers import, rating/favorite, editing, crop, undo/redo, compare, zoom, live MCP-to-UI synchronization, stdio previews, and batch export. Screenshots are written to `output/playwright/`.

To exercise the packaged app instead of the development build:

```sh
LUMAFLUX_EXECUTABLE="$PWD/release/mac-arm64/Lumaflux.app/Contents/MacOS/Lumaflux" node scripts/e2e.mjs
```

Research and architectural decisions are in [docs/research/architecture-references.md](docs/research/architecture-references.md). Original implementation; no code was copied from the photo editor reference projects.

Library mode shows its left sidebar with All photos, Favorites, Exports, imported folders, and local directory exploration. Import controls stay at its bottom; drag the panel divider to resize it. Edit mode shows the resizable Adjustments / Composition / Info inspector. Copy and paste icons share one row with Apply to selected.

Preview rendering caches downsampled sources and geometry within per-worker byte limits, invalidates replaced source files, and prioritizes canvas updates over queued thumbnails. Crop-frame updates reuse the background. Exports and 1:1 viewing use the full source. Run `npx tsx scripts/benchmark-preview.ts --preview` for the synthetic 24-megapixel preview benchmark.

## Releases

Download desktop installers from [GitHub Releases](https://github.com/IT-PSAPE/lumaflux/releases). Releases are built from the version in `release.yaml`. See [the release process](docs/releases.md) for platforms, version mapping, validation, and retry instructions.

RAW decoding uses [LibRaw-Wasm](https://github.com/ybouane/LibRaw-Wasm) 1.6.0, bundled locally (no external converter installation or network required). Its WebAssembly engine runs in disposable workers; developed sources are cached within a 128 MB limit per rendering context and invalidated when originals change.

Lens correction is available under **Composition → Lens correction** (manual distortion, corner illumination, and red/blue fringe alignment). **Adjustments → Details** contains separate luminance and color noise reduction. Both work with RAW/raster photos, exports, undo, and MCP edits. See [lens correction and denoising](docs/lens-and-denoising.md) for ranges, behavior, and limitations.

The inspector's RGB histogram supports tonal-region dragging, clipping previews (hover or click the corner indicators; **J** toggles both), and RGB readings when hovering over the edited photo. It updates from the rendered preview and follows the current crop. See [histogram behavior](docs/histogram.md).

## Automatic correction and professional editing

**Auto** at the right of **Light** measures the selected image and applies conservative, undoable tonal adjustments. **Auto** at the right of **Lens correction** reads camera/lens/focal metadata and matches a bundled Lensfun calibration. JPEG and PNG can retain EXIF too. Missing or ambiguous matches are reported without guessed edits. Profile changes clear the crop; manual lens offsets remain adjustable. **Remove profile** disables the calibration.

Agents now receive a professional photography guide through MCP initialization, `get_editing_guide`, `lumaflux://guides/professional-editing`, and the `professional-photo-edit` prompt. The portable [skill](skills/professional-photo-editing/SKILL.md) is also included with packaged apps. Restart Lumaflux and reconnect the agent to discover the new tools.

- `analyze_photo({id})`: measured rendered tone, clipping, and color statistics.
- `get_lens_match({id})`: inspect calibration availability; `auto_lens_correction({id, expectedRevision})` applies it.
- `suggest_adjustments({id, referenceId?})`: propose image-specific Light adjustments. A reference fits its rendered tone; it does not copy recipe values. Apply the returned patch with `apply_edits` and its `expectedRevision`.
- `auto_adjust({id, expectedRevision, referenceId?})`: calculate and apply directly with undo.
- `get_preview({id, original?, uncropped?, patch?})`: inspect an original, full composition, or candidate edit without committing it.

The guide calls for individual visual inspection, natural color, an explicit crop/no-crop decision, and before/after verification. Automatic tone is a starting point, not semantic subject recognition. RAW currently develops to 8-bit sRGB before slider edits; it does not reconstruct clipped sensor highlights. Full rationale, source comparisons, and limitations are in [the research report](docs/auto-editing-research.md).

Application code is MIT licensed. The separately attributed Lensfun calibration data remains CC BY-SA 3.0; see [third-party notices](THIRD_PARTY_NOTICES.md).
