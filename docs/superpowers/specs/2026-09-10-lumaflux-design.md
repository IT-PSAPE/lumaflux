# Lumaflux: lightweight desktop photo editor

Status: proposed design for review. Implementation has not started.

## Outcome

An offline Electron desktop application for importing, browsing, selecting, editing, and exporting photos. React supplies the interface, Base UI supplies accessible controls, and Tailwind supplies styling. Local agents can perform the same operations through MCP, with changes reflected in the open application.

The initial format baseline is JPEG, PNG, WebP, and TIFF. Camera RAW development is a pending scope decision, not an implied capability. No accounts or hosted services are required.

## Interface and workflows

Use a restrained three-column workspace. The left sidebar contains import actions, all photos, folders, favorites, and export jobs. The center switches between a thumbnail gallery and a single-image editor. The right sidebar contains image information and grouped editing controls. A bottom filmstrip supports moving between photos while editing.

Import individual files, multiple files, or folders through native dialogs; support file drag-and-drop. Register original paths without modifying or moving source files. Recursively scan folders with bounded concurrency, skip unsupported files, avoid symlink loops, deduplicate canonical paths, and report individual import failures. Persist the catalog between launches. Missing originals remain visible with a clear missing-file state and a relink action.

Gallery browsing includes filename search, folder filtering, favorites, ratings, name/date sorting, adjustable thumbnail size, and select-all/clear-selection. Standard modifier keys support additive and range selection. Double-click enters editing. Keyboard shortcuts support gallery/editor switching, navigation, undo/redo, and selection without stealing input from form fields.

Single-image viewing supports fit, actual pixels, zoom, pan, and original/edited comparison. Show dimensions, format, file size, and available camera metadata. Generate thumbnails lazily with a bounded cache; load full-size images only as needed.

## Editing model

Store a versioned, validated recipe per photo. Originals remain untouched. Editing controls include exposure, brightness, contrast, highlights, shadows, whites, blacks, temperature, tint, hue, saturation, vibrance, sharpening, and vignette. Define numeric ranges and units in a shared schema used by the UI and MCP.

Geometry includes draggable crop selection, free and fixed aspect ratios, quarter-turn rotation, horizontal/vertical flip, and straighten. Define the operation order explicitly: EXIF orientation, rotation/straighten, flips, crop, tonal/color adjustments, finishing, output resize, encoding. Crop coordinates are normalized against the oriented and transformed image; geometry changes reset an incompatible crop. Validate crop bounds before rendering.

Use a shared pixel-processing implementation for preview and export. Sharp handles decode, EXIF orientation, color conversion, geometry, resize, and encoding. A deterministic pixel stage implements controls not directly supplied by Sharp. Convert supported inputs into a documented sRGB working space. Exposure is applied in linear light; other artistic controls have documented semantics. This is a foundational raster editing pipeline, not a scene-referred RAW development system.

Run rendering outside the Electron renderer and main event loop, with bounded worker concurrency. Previews use reduced-resolution sources and latest-request-wins scheduling; obsolete results must never replace newer edits. Full-resolution exports run sequentially or with a small concurrency limit to bound memory. Record image size limits and fail oversized/unsupported inputs clearly rather than hanging.

Support per-photo undo/redo, reset, copy/paste adjustments, and applying adjustments to a selection. A completed slider gesture creates one history entry. Persist committed recipes and history. Batch edits validate every target before committing. Each photo has a monotonically increasing revision so stale agent/UI writes produce an explicit conflict instead of silently overwriting newer work.

## Catalog and application boundary

The Electron main process owns a single catalog service and serialized mutation queue. Use an atomically replaced, versioned JSON catalog for the first release; keep storage behind a repository interface for later SQLite migration. On save failure, retain the previous catalog and surface the error. Use a single-instance lock to avoid concurrent application writers.

The service exposes named, validated commands for importing, listing, selection, metadata, recipes, history, preview, and exports. Renderer IPC and MCP call this same service. Broadcast committed catalog changes to the UI. Agents never manipulate React state or write catalog files directly.

Keep Electron context isolation and sandboxing enabled, Node integration disabled, and expose a narrow preload API. Restrict navigation and new windows. Serve image data through an asset-ID-based protocol, not arbitrary renderer-requested filesystem paths. Validate IPC senders and all payloads.

Suggested modules:

- `src/shared`: schemas, recipes, catalog types, command contracts.
- `src/core`: catalog repository, commands, history, import and export jobs.
- `src/imaging`: render pipeline, workers, thumbnails, preview cache.
- `src/electron`: window lifecycle, preload, IPC, asset protocol.
- `src/mcp`: server, tool/resource registration, transport adapter.
- `src/renderer`: application shell, gallery, viewer/crop interaction, adjustment panel, export dialog, agent settings.
- `tests`: image fixtures, core/pipeline tests, MCP integration tests, Electron workflow tests.

## Export

Export one image or a selection as JPEG, PNG, or WebP. Include destination folder, quality where applicable, optional maximum dimension, and filename suffix. Preserve original files and use exclusive output creation with unique suffixes for collisions. Do not silently overwrite existing files, including originals.

Each export job snapshots source IDs and recipes at creation. Show queued/running/completed/failed/cancelled states, progress, destination, and per-image errors. Cancellation stops remaining work; completed outputs remain available. Use temporary files followed by safe finalization so interrupted jobs do not leave apparently successful partial images. Convert output to sRGB; omit location metadata by default and explicitly document metadata handling.

## MCP integration

Use the official TypeScript SDK. Expose a loopback-only authenticated Streamable HTTP endpoint owned by the running desktop app. Supply a small stdio adapter for agent clients that launch local MCP processes. The adapter connects to the existing app service; it must not create a second catalog writer. A settings panel shows connection status, endpoint, and a copyable client configuration. Keep credentials in a user-only configuration file, never source control or ordinary logs.

Validate host/origin for HTTP requests, require a token, and constrain imports/exports to explicitly configured filesystem roots. Canonicalize paths and account for symlinks. MCP is disabled until enabled in application settings. Disabling it closes the listener. A missing running app produces a clear error from the stdio adapter.

Tool families:

- Discovery: `get_capabilities`, `get_app_state`, `list_photos`, `get_photo`, `get_selection`.
- Library: `import_photos`, `set_selection`, `update_metadata` for ratings/favorites.
- Editing: `get_recipe`, `apply_edits`, `apply_batch_edits`, `reset_edits`, `undo`, `redo`.
- Visual feedback: `get_preview` returns an image content block with recipe revision and rendered dimensions.
- Output: `export_photos`, `get_export_job`, `cancel_export_job`.

Use strict schemas, bounded pagination and batch sizes, explicit photo IDs, expected revisions for mutations, structured error codes, and accurate read-only/destructive/idempotent tool annotations. Batch operations return per-photo results. Export jobs return IDs immediately. The app-state resource provides selection and library summaries; photo resources expose metadata and recipes. Publish resource updates where supported and maintain an activity log identifying UI versus agent mutations.

## Validation and acceptance

1. Import a directory containing supported, duplicate, corrupt, and unsupported files; usable photos appear and failures are explained.
2. Relaunch the app and recover library, ratings, recipes, and history without changing source hashes.
3. Select multiple photos, filter/search, open one, zoom/pan, crop/rotate/flip, adjust color, compare, undo, and redo through the actual Electron UI.
4. Verify generated fixtures numerically for exposure direction, neutral recipe identity, crop dimensions, EXIF orientation, hue/saturation behavior, and alpha handling.
5. Export a batch at requested dimensions/formats; verify files by decoding them, exercise collisions, cancellation, missing originals, and partial failures.
6. Use a real MCP client to initialize, discover tools/resources, import, edit, retrieve an image preview, undo, and export. Verify UI synchronization and stale-revision errors.
7. Reject unauthenticated MCP requests, invalid origins, out-of-root paths, malformed recipes, and attempts to overwrite source files.
8. Run type checks, production build, automated integration tests, and an Electron smoke test. Produce a local runnable application and document launch/MCP setup. Code signing and distribution credentials are separate from a working local build.

## Deliberate exclusions

Layers, brushes/masks, healing, AI generation, face recognition, cloud sync, tethering, printing, and Lightroom catalog compatibility are outside this first foundation. RAW support awaits the format decision. Large-library virtualization and a database migration should be driven by measured limits after the core workflow is verified.
