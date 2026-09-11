# Lens correction and denoising

This addition builds on upstream `2fc6fa4`, including the RAW decoder.

## Controls

Composition → Lens correction exposes manual distortion (-100 to 100), corner illumination (0 to 100), red/cyan fringe alignment (-100 to 100), and blue/yellow fringe alignment (-100 to 100). Zero disables each correction. These manual offsets now coexist with **Auto**, which matches camera/lens/focal metadata against bundled Lensfun calibrations. See [automatic editing research and behavior](auto-editing-research.md).

Distortion uses a radial polynomial with bilinear, alpha-aware resampling and automatic inward scaling to avoid introducing empty borders. Chromatic correction radially aligns the red and blue channels to green (maximum ±0.5%). Corner illumination compensates dark corners in source coordinates before any warp or crop, separately from the creative Vignette adjustment.

Adjustments → Details exposes independent Luminance noise and Color noise sliders (0 to 100). Noise reduction uses two separable bilateral passes, with independent luminance/chroma strengths and edge-aware weights. Alpha is preserved and invisible pixels do not contaminate visible neighbors. It is a conventional filter, not generative/AI denoising. Use 1:1 to evaluate fine detail; screen-sized previews estimate the full-resolution result.

## Processing and persistence

Lens correction follows source decoding/EXIF orientation and precedes rotation, flipping, and crop. Denoising follows geometry/resizing, before tone/color and sharpening. Preview source buffers stay immutable. Geometry caches include lens settings, and a separate 16 MiB-per-worker cache stores denoised previews so later tonal edits reuse the result. Full-resolution exports use the same algorithms without preview downsampling.

Existing catalog recipes/history default all new controls to zero. Noise reduction is included in copy/paste and Apply to selected. Lens settings stay with each photo, like crop and rotation. Changes to distortion or channel alignment clear an existing crop unless an explicit replacement crop is supplied in the same edit.

MCP `get_capabilities` describes these controls; `apply_edits` and `apply_batch_edits` accept `lensDistortion`, `lensVignette`, `lensRed`, `lensBlue`, `noiseLuminance`, and `noiseColor`, using existing revision checks. Undo/redo and reset include all new settings.

## References

The manual radial model and ordering were informed by [Lensfun's correction models](https://lensfun.github.io/manual/v0.3.1/group__Lens.html) and [correction ordering](https://lensfun.github.io/manual/v0.3.1/corrections.html). Edge-aware denoising follows the bilateral-filter principle described by [Tomasi and Manduchi](https://users.cs.duke.edu/~tomasi/papers/tomasi/tomasiIccv98.pdf), using a separable approximation for interactive operation. The later Auto feature bundles an attributed Lensfun database subset under CC BY-SA 3.0; no Lensfun library code is incorporated.

## Verification

`tests/corrections.test.ts` checks neutral identity, schema compatibility, opaque bounds, edge lifting, relative channel alignment, noise reduction, retained luminance structure, and edge contrast. `tests/corrections-integration.test.ts` covers original-file preservation, cache invalidation, matching small-image preview/export output, persisted edits, and undo. MCP integration exercises all six parameters. The Electron workflow manipulates the new sliders and runs the existing crop/compare/export workflow.

A local synthetic 6000×4000 JPEG benchmark with all correction stages enabled measured 989 ms for the first 1600px preview and an 18 ms warm median for subsequent exposure edits reusing those stages. This is not a guarantee for arbitrary photos or changing lens/noise settings. Reproduce with `npx tsx scripts/benchmark-preview.ts --preview --corrections`.
