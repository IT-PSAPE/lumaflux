import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderImage } from "../src/imaging/render";
import { neutralRecipe } from "../src/shared/model";
import { resizeCrop } from "../src/renderer/crop";
test("straightening opaque images never introduces transparent corners", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lf-geometry-"));
  for (const [width, height] of [
    [300, 200],
    [200, 300],
  ]) {
    const file = path.join(dir, `${width}.png`);
    await sharp({
      create: { width, height, channels: 3, background: "#ca7090" },
    })
      .png()
      .toFile(file);
    for (const rotation of [0, 1])
      for (const straighten of [-45, -30, -5, 5, 30, 45]) {
        const result = await renderImage(
          file,
          { ...neutralRecipe(), rotation, straighten },
          { format: "png" },
        );
        const { data, info } = await sharp(result)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += 4)
          assert.equal(
            data[i],
            255,
            `${width}x${height}, rotation ${rotation}, angle ${straighten}, pixel ${i}`,
          );
        assert.ok(info.width > 0 && info.height > 0);
      }
  }
});
test("all crop handles preserve locked ratio and stay inside bounds", () => {
  const box = { x: 0.1, y: 0.2, width: 0.7, height: 0.5 };
  for (const handle of ["n", "ne", "e", "se", "s", "sw", "w", "nw"])
    for (const dx of [-2, -0.1, 0.1, 2])
      for (const dy of [-2, -0.1, 0.1, 2]) {
        const b = resizeCrop(box, handle, dx, dy, 1.4);
        assert.ok(
          b.x >= -1e-12 &&
            b.y >= -1e-12 &&
            b.x + b.width <= 1 + 1e-12 &&
            b.y + b.height <= 1 + 1e-12,
        );
        assert.ok(b.width > 0 && b.height > 0);
        assert.ok(Math.abs(b.width / b.height - 1.4) < 1e-10);
      }
});
