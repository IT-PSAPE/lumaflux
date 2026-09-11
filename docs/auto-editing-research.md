# Automatic correction and professional photo editing

## Findings and implementation decision

Automatic editing needs three separate capabilities: an equipment calibration, a measured tonal starting point, and photographic judgment. Camera metadata cannot substitute for measured lens coefficients. A histogram cannot decide the subject or the intended mood. A language model cannot provide reliable image-specific edits if it never receives pixels or if its only batch operation is copying a recipe.

Lumaflux therefore adds calibrated lens Auto, measured Light Auto, and an MCP workflow combining statistics with previews and explicit composition review. All processing remains local. The tone implementation is deterministic and inspectable; it does not require a model download or a paid inference service. The agent supplies visual judgment through its existing vision capability. A client without vision still receives measurements but must not claim a visual or composition assessment.

The application source and bundled photography skill are MIT licensed. Lensfun's database retains its separate CC BY-SA 3.0 license. This is an independent implementation, not an Adobe implementation or a claim of Photoshop/Lightroom parity.

## What Adobe actually documents

Photoshop's classic Auto Contrast expands overall tonal range; Auto Tone treats channels separately and can alter color. Its Auto Color options include neutral midpoint handling. Adobe describes selecting endpoints and clipping percentages as part of those operations. These are useful baselines, but channel-wise normalization can neutralize intentional illumination or alter skin and product colors. [Adobe, Make quick tonal adjustments, updated May 24, 2023](https://helpx.adobe.com/photoshop/using/making-quick-tonal-adjustments.html).

Lightroom's current Auto is described as Adobe Sensei analysis followed by automatic adjustments, with sliders available for refinement. That public description does not expose model weights, training data, inference code, or the complete decision function. Reproducing the button's intent is feasible; claiming to reproduce its learned algorithm is not supported by the public evidence. [Adobe, Apply Auto settings in Lightroom](https://helpx.adobe.com/lightroom/mobile/adjust-light-and-color/apply-auto-settings.html).

Adobe also distinguishes camera rendering profiles from subsequent tone controls. These are different stages; a RAW conversion that uses a matrix and gamma does not automatically reproduce a manufacturer's JPEG look. Lumaflux does not ship Adobe camera profiles. [Adobe, Adjust color rendering for your camera](https://helpx.adobe.com/camera-raw/desktop/edit-and-enhance-images/tone-and-color/adjust-color-rendering-camera-camera.html).

## Open implementations worth learning from

RawTherapee's Auto Levels uses histogram analysis to set exposure controls. Its Auto-Matched Tone Curve instead aims at the camera's embedded JPEG appearance. The latter is valuable when the desired reference is the camera rendering, but it depends on an embedded preview and is distinct from global exposure normalization. Lumaflux's implementation uses its own rendered pixels and can accept another approved photograph as a tonal reference. It does not currently extract and fit the embedded camera JPEG. [RawPedia, Exposure](https://rawpedia.pixls.us/exposure/).

Darktable uses metadata identification together with Lensfun and also supports embedded correction metadata for some cameras. Its documentation explicitly acknowledges missing and incomplete profiles. This supports treating “no supported calibration” as an ordinary outcome rather than manufacturing correction values from focal length or brand. [Darktable, Lens correction](https://docs.darktable.org/usermanual/4.6/en/module-reference/processing-modules/lens-correction/) and [Darktable, On lens detection and correction](https://www.darktable.org/2015/02/on-lens-detection-and-correction/).

Lensfun separates lens identity from distortion, transverse chromatic aberration, and vignetting calibration. The documented radial models include poly3, poly5 and PTLens; TCA can use linear or polynomial channel scaling. Different models use different coordinate conventions. Distortion/TCA coefficients should not be pushed into an unrelated single distortion slider. Lumaflux saves a separate calibration snapshot and applies it before existing manual offsets. [Lensfun, lens structures and models](https://lensfun.github.io/manual/latest/group__Lens.html).

The database is independently useful without incorporating the Lensfun C++ library. Its source revision and conversion script are included in the repository, with original numeric values and the full data license. This avoids a new platform-native dependency in the Windows/macOS/Linux packaging matrix. The tradeoff is deliberately narrower matching and interpolation than the full Lensfun library. [Lensfun database source](https://github.com/lensfun/lensfun/tree/7314a049f33b89f8a59ae3d7c65a086cc1a85dc6/data).

## Metadata and calibration rules

The importer already reads standard EXIF from raster files and LibRaw metadata from supported RAW files. JPEG can retain camera, lens, focal length, aperture and ISO. PNG may contain EXIF too; absence of metadata is a file property, not a universal format rule. Auto re-inspects the source so previously imported photos can benefit from newly recognized fields.

The matcher requires camera identity, lens identity, and positive focal length. Camera lookup determines sensor crop factor. Lens lookup uses normalized exact names, compatible recorded mount, and a calibration covering that sensor size. It removes formatting differences and common maker prefixes but does not infer a lens from focal length alone. Ambiguous matches are rejected. Unsupported fisheye/projection models and off-center calibrations are excluded during database conversion.

Focal coefficients interpolate linearly between measured samples of the same model. There is no extrapolation beyond the measured range. This is intentionally simpler than Lensfun's full interpolator and should be evaluated on real calibration charts before extending support. Corner illumination is more constrained: it needs matching aperture and focus distance, or distance-independent matching measurements. Missing shading data leaves manual illumination available. The result reports which correction components are unavailable.

The profile uses calibration sensor dimensions and camera sensor dimensions when mapping coordinates. Distortion and channel alignment use inverse sampling with an inward fit; vignetting compensation is applied in source coordinates using linearized channel values. Bilinear sampling is alpha aware. The recipe stores the source revision, profile identity and coefficient values, so a future database update cannot silently change an existing edit or export. Manual offsets remain separately adjustable, and Remove profile is undoable.

A camera JPEG can already be corrected even while retaining complete EXIF. Standard lens identity alone does not prove whether correction has already happened. The UI and MCP report this limitation for rendered files. The user/agent should compare straight lines and corners instead of assuming that a profile must improve every file. Proprietary MakerNote correction arrays and DNG lens opcodes are not interpreted in this release.

## Automatic tone design

The Light Auto operation measures a bounded PNG preview generated through the same rendering pipeline used by the editor. It measures the actual visible crop and calibration, not an unrelated thumbnail. Analysis ignores transparent pixels and includes luminance percentiles, channel clipping and color statistics. A PNG sample avoids introducing JPEG quantization into the optimization itself.

The suggestion starts from neutral Light controls while retaining the photo's color, detail, lens and composition settings. That makes repeated Auto requests deterministic rather than progressively stacking adjustments. It searches a bounded set of candidate values against the actual renderer. This matters because Lumaflux's Exposure is linear-light gain followed by sRGB encoding, while brightness/contrast and highlight/shadow controls operate differently. A generic recipe formula from another editor would not have equivalent effects.

The fitting objective balances useful tonal distribution against new clipping and excessive changes. It returns the proposed patch, measurements before/after and warnings. Auto is a starting point: a low-key portrait, snow scene, concert or backlit silhouette can legitimately occupy a narrow or unusual range. Flat/empty inputs should avoid aggressive normalization. Color balance and crop are preserved because image statistics alone cannot establish semantic neutrality or subject framing.

The implementation and synthetic tests are in `src/imaging/auto-tone.ts` and `tests/auto-tone.test.ts`. The tests exercise different exposures, reference targets, deterministic behavior and preservation of unrelated settings. Numeric tests establish behavior and regression protection, not universal photographic quality. Real-photo evaluation remains necessary for particular cameras and genres.

## Reference matching and its limits

Color-transfer research demonstrates that source/target distribution statistics can guide appearance transfer, but similar statistics do not imply similar subjects or lighting. A grass-heavy scene and a neutral studio portrait should not be forced to the same average color. Lumaflux therefore uses the approved reference's rendered tonal distribution as a bounded Light target and leaves color/composition decisions to visual inspection. [Reinhard et al., Color Transfer between Images, 2001](https://www.math.tau.ac.il/~turkel/imagepapers/ColorTransfer.pdf).

For each target, `suggest_adjustments` receives a `referenceId`, measures that target independently, and fits its own patch. A darker exposure can require a larger gain even when both images should reach a similar result. The reference is never mutated. The response includes both revisions; a reference changing during analysis produces a conflict rather than silently fitting against a moving target.

Matching tone is not full artistic style transfer. After numeric fitting the agent compares subject brightness, highlight texture, saturation, skin and neutral objects. It can propose color adjustments with evidence, inspect a candidate without committing, and then apply an individual patch. Grouping similar lighting is useful, but copying settings across unrelated photographs is not adaptive matching. The existing exact Copy/Paste controls remain exact by design.

## Why RAW can look unfinished

LibRaw exposes separate controls for camera white balance, output color, gamma, bit depth and histogram-based automatic brightness. Lumaflux currently uses camera WB and a fixed-brightness sRGB conversion, with an 8-bit developed output. That baseline is stable, but it is not a camera JPEG tone curve or a full scene-linear high-bit-depth editing pipeline. [LibRaw, Data Structures and Constants](https://www.libraw.org/docs/API-datastruct.html).

This explains why zero sliders can look dark and why generic “lift shadows, reduce highlights” edits can make a RAW-derived preview look flatter. A measured exposure/contrast starting point helps. It cannot reconstruct sensor highlights already clipped during decoding. The agent guide and capabilities now state this precisely, instead of encouraging impossible recovery claims. A future deeper RAW pipeline would retain linear high-bit-depth data through white balance and highlight handling, then apply a controlled display rendering transform; that is a separate architectural change.

White balance deserves similar care. A known neutral patch is useful evidence, whereas global scene average can be dominated by colored surfaces or deliberate warm lighting. Rendered images have already undergone camera processing, so their relative channel edits are not equivalent to RAW temperature in Kelvin. [RawPedia, White Balance](https://rawpedia.pixls.us/white_balance/) and [Afifi et al., Interactive White Balancing for Camera-Rendered Images](https://arxiv.org/abs/2009.12632).

## Agent skills investigated

The Wayland photography skill covers broad Lightroom/Photoshop workflow and preset management, but also includes fixed ranges for highlights, shadows and other adjustments. Those ranges are unsuitable as universal instructions for this request. Its workflow is useful research context; no text was copied. [FerroxLabs/Wayland, photo-editing-master](https://github.com/FerroxLabs/wayland/blob/main/src/process/resources/skills-library/bodies/skills/design-creative/photo-editing-master/SKILL.md).

Agent Media's image-edit skill exposes generative editing models and prompt-based transforms. That is a different task from preserving a photograph while developing its pixels nondestructively; it is not the foundation for this feature. [Agent Media, image-edit skill](https://github.com/agntswrm/agent-media/blob/main/skills/image-edit/SKILL.md).

PhotoArtAgent describes an analysis/planning/parameter-editing agent workflow for Lightroom. It supports investigating explicit diagnosis and tool-driven adjustment, but a research result is not proof that any client following a skill will produce professional work reliably. Lumaflux adopts a transparent inspect–propose–preview–verify loop without shipping that project's model or code. [PhotoArtAgent, 2025 paper](https://arxiv.org/abs/2505.23130).

The resulting skill is specific to actual Lumaflux tools and their limits. It addresses natural color, subject brightness, intentional shadows, highlights that should retain texture versus specular clipping, noise/detail review, per-image reference matching and a mandatory composition decision. Composition review can result in no crop; arbitrary cropping is not a sign of a better edit. When cropping is justified, the agent must inspect full corrected framing and use normalized coordinates after geometry changes.

## Delivery and verification

The guide is built into MCP server instructions, exposed as a tool and resource, and available through a professional-edit prompt. It is also shipped as an installable `SKILL.md` in the repository and packaged resources. This improves discoverability across clients without altering users' global agent settings. Clients ultimately control whether they load instructions and inspect image responses; the server cannot guarantee the behavior of every external agent.

Auto buttons occupy the far right of the Light and Lens correction headers. Operations are local, revision checked, undoable, and retain original bytes. Missing metadata/profile results are visible, and candidate preview requests do not mutate the catalog. Validation covers matching, pixel geometry, legacy recipe defaults, metadata inspection, command conflicts, MCP discovery and previews, and desktop controls. The release version is not changed by this feature commit; pushing source does not implicitly create a new public release.
