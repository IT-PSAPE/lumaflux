import { copyFile } from "node:fs/promises";
import { build } from "esbuild";
import { build as viteBuild } from "vite";
await build({
  entryPoints: ["src/electron/main.ts", "src/imaging/worker.ts"],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["src/electron/preload.ts"],
  outfile: "dist/electron/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/mcp/stdio.ts"],
  outfile: "dist/mcp/stdio.js",
  bundle: true,
  platform: "node",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
await viteBuild();

await copyFile("src/imaging/raw-decoder.mjs", "dist/imaging/raw-decoder.mjs");
