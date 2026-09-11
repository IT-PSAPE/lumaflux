import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { suggestAutoTone, analyzePhoto } from "../src/imaging/auto-tone";
import { renderImage } from "../src/imaging/render";
import { neutralRecipe } from "../src/shared/model";
test("Auto fits individual photos and adapts reference tone without copying recipes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lumaflux-auto-"));
  try {
    const make = async (name: string, factor: number) => {
      const data = Buffer.alloc(128 * 64 * 3);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 128; x++)
          for (let c = 0; c < 3; c++)
            data[(y * 128 + x) * 3 + c] = Math.round((25 + x * 1.4) * factor);
      const file = path.join(dir, name + ".png");
      await sharp(data, { raw: { width: 128, height: 64, channels: 3 } })
        .png()
        .toFile(file);
      return file;
    };
    const dark = await make("dark", 0.45),
      bright = await make("bright", 1),
      r = neutralRecipe();
    const a = await suggestAutoTone(renderImage, dark, r),
      b = await suggestAutoTone(renderImage, bright, r);
    assert.notDeepEqual(a.patch, b.patch);
    assert.ok(a.after.percentiles.p50 > a.before.percentiles.p50);
    const target = await analyzePhoto(renderImage, bright, r);
    const m = await suggestAutoTone(renderImage, dark, r, {
      file: bright,
      recipe: r,
    });
    assert.ok(
      Math.abs(m.after.percentiles.p50 - target.percentiles.p50) <
        Math.abs(m.before.percentiles.p50 - target.percentiles.p50),
    );
    assert.ok(!("crop" in m.patch));
    assert.ok(!("lensProfile" in m.patch));
    assert.ok(!("temperature" in m.patch));
    const repeat = await suggestAutoTone(renderImage, dark, {
      ...r,
      ...a.patch,
    });
    assert.deepEqual(repeat.patch, a.patch);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Auto does not invent detail in transparent or uniform input", async () => {
  const render = async () =>
    sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
  const a = await suggestAutoTone(render, "unused", neutralRecipe());
  assert.deepEqual(a.patch, {});
  assert.ok(a.warnings.length);
  assert.equal(a.before.pixels, 0);
});
