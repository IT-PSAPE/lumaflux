# Architecture research

Reviewed 2026-09-10. These are architectural references; no implementation code has been copied.

## Existing applications

- [darktable](https://github.com/darktable-org/darktable): nondestructive photo workflow organized around a lighttable, development, catalog, and export. Adopt separation between originals and editing instructions, plus browsing/editing modes. Do not embed its full RAW pipeline for a lightweight Electron foundation.
- [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor): canvas-oriented photo editing with geometry and filters. Useful interaction reference for crop/rotation and undo. Its canvas-centered editor alone does not supply a persistent photo catalog or shared headless MCP editing service.
- [Immich](https://github.com/immich-app/immich): photo management with metadata, albums, favorites, folder view, and virtual scrolling. Useful reference for separating library navigation from individual asset presentation. Its self-hosted service architecture and backup scope are unnecessary for this local desktop app.

## Platform references

- [Sharp image operations](https://sharp.pixelplumbing.com/api-operation/): native decode/manipulation/encoding building blocks. Evaluate exact operation ordering and color behavior through fixtures rather than assuming filters reproduce Lightroom semantics.
- [Base UI Slider](https://base-ui.com/react/components/slider): composable accessible slider primitives, labels, controlled values, and value-change events. Use alongside Base UI dialogs, tooltips, and other needed controls with Tailwind styling.
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security): context isolation, sandboxing, IPC sender validation, restrictive navigation, and narrow bridges guide the desktop boundary.
- [MCP TypeScript server guide](https://ts.sdk.modelcontextprotocol.io/server): official server APIs support stdio and Streamable HTTP. Pin and test the selected SDK version; do not mix v1 and v2 import conventions.
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports): local HTTP services need origin validation and loopback binding. Authentication is still necessary for the proposed desktop control surface.

## Alternatives and decision

1. **Shared native-backed service (recommended):** Electron owns catalog and commands; worker rendering is shared by UI and MCP. More initial plumbing, but consistent edits, exports, and agent behavior.
2. **Browser-only canvas editor:** fastest single-image prototype; keeping independent headless rendering, persistence, and batch exports consistent becomes additional work.
3. **Embed a mature RAW engine:** broader photo-development capabilities, but brings native builds, larger dependencies, pipeline translation, and licensing/integration obligations beyond the requested lightweight foundation.

Start with option 1 and a versioned recipe contract. This recommendation is an engineering inference from the sources, not a claim that any referenced project implements this exact architecture.
