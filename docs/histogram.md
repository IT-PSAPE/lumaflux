# Histogram

A compact, fixed-height histogram sits above Adjustments / Composition / Info. It stays visible while the inspector scrolls and follows its width when resized.

The interaction follows [Adobe's Lightroom Classic histogram documentation](https://helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/image-tone-color.html): overlapping RGB distributions, shadow/highlight clipping indicators, tonal-region dragging, and RGB readings under the graph when hovering over the photo.

- Red, green, and blue channels use 256 bins, a shared linear frequency scale, and additive overlap colors. Dark tones are on the left and bright tones on the right.
- Drag the five regions to change Blacks, Shadows, Exposure, Highlights, or Whites. The corresponding slider updates live. Arrow keys adjust a focused region, Shift makes larger steps, and double-click resets its control. Each drag commits one revision and supports undo.
- Top-corner indicators show which channels reach their endpoints. Hover temporarily displays clipped preview pixels (blue for zero, red for 255); click pins the overlay. J toggles both while editing. If a pixel has both kinds of clipped channel, the highlight overlay takes precedence.
- Hover the edited photo for RGB percentages. Comparison keeps the graph and overlays attached to the edited side. Composition's histogram counts the current crop region; crop handles update it without requesting another image render.

This is a display-referred histogram of the rendered sRGB preview, sampled to at most 1024 pixels on its longest edge. It is not a sensor RAW histogram, Lightroom's internal working-space histogram, or an exact full-resolution clipping count. Preview scaling and JPEG encoding can affect endpoint readings. The graph and overlays use the same decoded preview, and the indicator tooltips explicitly report sampled pixel counts.

The existing displayed image is read once per loaded frame; there is no additional backend render, file read, or MCP request for histogram updates. Tests cover channel counts, crop exclusion, clipping masks, transparent pixels, sampling bounds, live UI updates, tonal-region input, placement above the tabs, clipping overlays, and RGB readings.
