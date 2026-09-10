import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderImage, inspectImage } from "../src/imaging/render.js";
import { neutralRecipe, recipeSchema } from "../src/shared/model.js";

let dir: string;

test.before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "lumaflux-imaging-"));
});
test.after(async () => {
  const fs = await import("node:fs/promises");
  await fs.rm(dir, { recursive: true, force: true });
});

async function makePng(opts: {
  w: number;
  h: number;
  channels?: 3 | 4;
  fill: [number, number, number, number];
}): Promise<string> {
  const p = path.join(
    dir,
    `f${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );
  await sharp({
    create: {
      width: opts.w,
      height: opts.h,
      channels: opts.channels ?? 4,
      background: {
        r: opts.fill[0],
        g: opts.fill[1],
        b: opts.fill[2],
        alpha: opts.fill[3] / 255,
      },
    },
  })
    .png()
    .toFile(p);
  return p;
}

async function centerPixel(
  buf: Buffer,
): Promise<{ r: number; g: number; b: number; a: number }> {
  const img = sharp(buf);
  const md = await img.metadata();
  const w = md.width!,
    h = md.height!;
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const cx = Math.floor(w / 2),
    cy = Math.floor(h / 2);
  const off = (cy * w + cx) * info.channels;
  return {
    r: data[off],
    g: data[off + 1],
    b: data[off + 2],
    a: info.channels >= 4 ? data[off + 3] : 255,
  };
}

async function avgLuminance(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    sum +=
      0.2126 * data[i] +
      0.7152 * (data[i + 1] ?? data[i]) +
      0.0722 * (data[i + 2] ?? data[i]);
  }
  return sum / (data.length / info.channels);
}

// --- Geometry tests ---

test("neutral recipe produces identical image", async () => {
  const p = await makePng({ w: 64, h: 64, fill: [128, 100, 80, 255] });
  const original = await readFile(p);
  const out = await renderImage(p, neutralRecipe());
  const origMeta = await sharp(original).metadata();
  const outMeta = await sharp(out).metadata();
  assert.equal(outMeta.width, origMeta.width);
  assert.equal(outMeta.height, origMeta.height);
  const oPx = await centerPixel(original);
  const nPx = await centerPixel(out);
  assert.equal(nPx.r, oPx.r);
  assert.equal(nPx.g, oPx.g);
  assert.equal(nPx.b, oPx.b);
});

test("rotation changes dimensions", async () => {
  const p = await makePng({ w: 100, h: 50, fill: [200, 100, 50, 255] });
  const r1 = await renderImage(p, recipeSchema.parse({ rotation: 1 }));
  const r2 = await renderImage(p, recipeSchema.parse({ rotation: 0 }));
  const m1 = await sharp(r1).metadata();
  const m2 = await sharp(r2).metadata();
  assert.equal(m1.width, m2.height);
  assert.equal(m1.height, m2.width);
});

test("flip preserves dimensions", async () => {
  const p = await makePng({ w: 48, h: 32, fill: [100, 200, 50, 255] });
  const out = await renderImage(p, recipeSchema.parse({ flipX: true }));
  const oMeta = await sharp(await readFile(p)).metadata();
  const nMeta = await sharp(out).metadata();
  assert.equal(nMeta.width, oMeta.width);
  assert.equal(nMeta.height, oMeta.height);
});

test("crop reduces dimensions", async () => {
  const p = await makePng({ w: 200, h: 100, fill: [50, 150, 200, 255] });
  const out = await renderImage(
    p,
    recipeSchema.parse({ crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }),
  );
  const meta = await sharp(out).metadata();
  assert.ok(meta.width! <= 101); // 200*0.5=100, ±1 rounding
  assert.ok(meta.height! <= 51); // 100*0.5=50, ±1 rounding
  assert.ok(meta.width! >= 99);
  assert.ok(meta.height! >= 49);
});

// --- Exposure tests ---

test("positive exposure brightens", async () => {
  const p = await makePng({ w: 16, h: 16, fill: [100, 100, 100, 255] });
  const base = await avgLuminance(
    await renderImage(p, recipeSchema.parse({ exposure: 0 })),
  );
  const bright = await avgLuminance(
    await renderImage(p, recipeSchema.parse({ exposure: 2 })),
  );
  assert.ok(bright > base, `bright ${bright} should be > base ${base}`);
});

test("negative exposure darkens", async () => {
  const p = await makePng({ w: 16, h: 16, fill: [200, 200, 200, 255] });
  const base = await avgLuminance(
    await renderImage(p, recipeSchema.parse({ exposure: 0 })),
  );
  const dark = await avgLuminance(
    await renderImage(p, recipeSchema.parse({ exposure: -2 })),
  );
  assert.ok(dark < base, `dark ${dark} should be < base ${base}`);
});

// --- Neutral recipe ---

test("neutral recipe is zero everywhere", async () => {
  const nr = neutralRecipe();
  assert.equal(nr.exposure, 0);
  assert.equal(nr.brightness, 0);
  assert.equal(nr.contrast, 0);
  assert.equal(nr.temperature, 0);
  assert.equal(nr.tint, 0);
  assert.equal(nr.hue, 0);
  assert.equal(nr.saturation, 0);
  assert.equal(nr.vibrance, 0);
  assert.equal(nr.sharpening, 0);
  assert.equal(nr.vignette, 0);
  assert.equal(nr.rotation, 0);
  assert.equal(nr.straighten, 0);
  assert.equal(nr.flipX, false);
  assert.equal(nr.flipY, false);
  assert.equal(nr.crop, null);
});

// --- Hue/Saturation tests ---

test("saturation adjustment shifts color toward gray", async () => {
  const p = await makePng({ w: 16, h: 16, fill: [255, 0, 0, 255] });
  const base = await centerPixel(
    await renderImage(p, recipeSchema.parse({ saturation: 0 })),
  );
  const desat = await centerPixel(
    await renderImage(p, recipeSchema.parse({ saturation: -100 })),
  );
  const rDiff = Math.abs(base.r - desat.r);
  const gDiff = Math.abs(base.g - desat.g);
  assert.ok(
    rDiff > 10 || gDiff > 10,
    `desaturation should shift RGB: rDiff=${rDiff} gDiff=${gDiff}`,
  );
});

test("hue rotation changes color", async () => {
  const p = await makePng({ w: 16, h: 16, fill: [255, 0, 0, 255] });
  const base = await centerPixel(
    await renderImage(p, recipeSchema.parse({ hue: 0 })),
  );
  const rotated = await centerPixel(
    await renderImage(p, recipeSchema.parse({ hue: 120 })),
  );
  assert.notEqual(
    base.g,
    rotated.g,
    `green channel should change with hue shift: ${base.g} vs ${rotated.g}`,
  );
});

// --- Alpha preservation ---

test("alpha channel preserved through render", async () => {
  const p = await makePng({
    w: 16,
    h: 16,
    channels: 4,
    fill: [100, 150, 200, 128],
  });
  const out = await renderImage(p, neutralRecipe());
  const { info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const px = await centerPixel(out);
  assert.ok(Math.abs(px.a - 128) < 5, `alpha should be ~128, got ${px.a}`);
});

test("render with no alpha input produces opaque output", async () => {
  const p = await makePng({
    w: 16,
    h: 16,
    channels: 3,
    fill: [128, 128, 128, 255],
  });
  const out = await renderImage(p, neutralRecipe());
  const { info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const px = await centerPixel(out);
  assert.equal(px.a, 255);
});

// --- Error rejection tests ---

test("rejects oversized images", async () => {
  const big = path.join(dir, "big.png");
  await sharp({
    create: { width: 10000, height: 10000, channels: 3, background: "black" },
  })
    .png()
    .toFile(big);
  await assert.rejects(renderImage(big, neutralRecipe()), /pixel limit/);
});

test("rejects multi-page images", async () => {
  const multi = path.join(dir, "multi.webp");
  const raw = Buffer.alloc(16 * 32 * 4, 255);
  raw.fill(50, 0, 16 * 16 * 4);
  await sharp(raw, {
    raw: { width: 16, height: 32, channels: 4, pageHeight: 16 },
  })
    .webp()
    .toFile(multi);
  assert.equal((await sharp(multi, { animated: true }).metadata()).pages, 2);
  await assert.rejects(
    renderImage(multi, neutralRecipe()),
    /multi-page or animated/,
  );
  await assert.rejects(inspectImage(multi), /multi-page or animated/);
});

// --- inspectImage ---

test("inspectImage returns dimensions and format", async () => {
  const p = await makePng({ w: 80, h: 60, fill: [50, 50, 50, 255] });
  const info = await inspectImage(p);
  assert.equal(info.width, 80);
  assert.equal(info.height, 60);
  assert.equal(info.format, "png");
  assert.ok(info.size > 0);
});

// --- Format options ---

test("jpeg output format", async () => {
  const p = await makePng({ w: 32, h: 32, fill: [100, 150, 200, 255] });
  const out = await renderImage(p, neutralRecipe(), {
    format: "jpeg",
    quality: 90,
  });
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "jpeg");
});

test("webp output format", async () => {
  const p = await makePng({ w: 32, h: 32, fill: [100, 150, 200, 255] });
  const out = await renderImage(p, neutralRecipe(), { format: "webp" });
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
});

test("default output is png", async () => {
  const p = await makePng({ w: 32, h: 32, fill: [100, 150, 200, 255] });
  const out = await renderImage(p, neutralRecipe());
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "png");
});

// --- maxDimension ---

test("maxDimension resizes without enlarge", async () => {
  const p = await makePng({ w: 200, h: 100, fill: [80, 80, 80, 255] });
  const out = await renderImage(p, neutralRecipe(), { maxDimension: 50 });
  const meta = await sharp(out).metadata();
  assert.ok(meta.width! <= 50);
  assert.ok(meta.height! <= 50);
});

test("maxDimension does not enlarge small images", async () => {
  const p = await makePng({ w: 20, h: 20, fill: [80, 80, 80, 255] });
  const out = await renderImage(p, neutralRecipe(), { maxDimension: 100 });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 20);
  assert.equal(meta.height, 20);
});

// --- Combined geometry ---

test("rotation plus crop applies in correct order", async () => {
  const p = await makePng({ w: 100, h: 50, fill: [200, 100, 50, 255] });
  // Rotate 90 then crop center 50%
  const out = await renderImage(
    p,
    recipeSchema.parse({
      rotation: 1,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    }),
  );
  const meta = await sharp(out).metadata();
  // After 90 rotation: 50x100; crop 50% → ~25x50
  assert.ok(meta.width! <= 27);
  assert.ok(meta.height! <= 52);
});

// --- Brightness/Contrast ---

test("brightness shifts all channels", async () => {
  const p = await makePng({ w: 8, h: 8, fill: [128, 128, 128, 255] });
  const base = await centerPixel(
    await renderImage(p, recipeSchema.parse({ brightness: 0 })),
  );
  const bright = await centerPixel(
    await renderImage(p, recipeSchema.parse({ brightness: 50 })),
  );
  assert.ok(
    bright.r > base.r,
    `brightness up should increase r: ${bright.r} > ${base.r}`,
  );
});

test("contrast expands range", async () => {
  const p = await makePng({ w: 8, h: 8, fill: [128, 128, 128, 255] });
  const base = await centerPixel(
    await renderImage(p, recipeSchema.parse({ contrast: 0 })),
  );
  const high = await centerPixel(
    await renderImage(p, recipeSchema.parse({ contrast: 100 })),
  );
  // High contrast from mid-gray should push values away from center
  const baseDev = Math.abs(base.r - 128);
  const highDev = Math.abs(high.r - 128);
  assert.ok(
    highDev >= baseDev,
    `contrast should expand deviation: ${highDev} >= ${baseDev}`,
  );
});

// --- Temperature/Tint ---

test("temperature shifts red/blue balance", async () => {
  const p = await makePng({ w: 8, h: 8, fill: [128, 128, 128, 255] });
  const warm = await centerPixel(
    await renderImage(p, recipeSchema.parse({ temperature: 80 })),
  );
  const cool = await centerPixel(
    await renderImage(p, recipeSchema.parse({ temperature: -80 })),
  );
  assert.ok(
    warm.r > cool.r,
    `warm should have more red: ${warm.r} > ${cool.r}`,
  );
  assert.ok(
    warm.b < cool.b,
    `warm should have less blue: ${warm.b} < ${cool.b}`,
  );
});

test("tint shifts green channel", async () => {
  const p = await makePng({ w: 8, h: 8, fill: [128, 128, 128, 255] });
  const pos = await centerPixel(
    await renderImage(p, recipeSchema.parse({ tint: 80 })),
  );
  const neg = await centerPixel(
    await renderImage(p, recipeSchema.parse({ tint: -80 })),
  );
  assert.ok(
    pos.g < neg.g,
    `positive tint should reduce green (magenta): ${pos.g} < ${neg.g}`,
  );
});

// --- Sharpening ---

test("sharpening is applied without error", async () => {
  const p = await makePng({ w: 32, h: 32, fill: [100, 100, 100, 255] });
  const out = await renderImage(p, recipeSchema.parse({ sharpening: 50 }));
  assert.ok(out.length > 0);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 32);
  assert.equal(meta.height, 32);
});

// --- Vignette ---

test("vignette darkens edges", async () => {
  const p = await makePng({ w: 64, h: 64, fill: [200, 200, 200, 255] });
  const out = await renderImage(p, recipeSchema.parse({ vignette: 100 }));
  const { data, info } = await sharp(out)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cx = 32,
    cy = 32;
  const centerLum =
    0.2126 * data[(cy * 64 + cx) * 4] +
    0.7152 * data[(cy * 64 + cx) * 4 + 1] +
    0.0722 * data[(cy * 64 + cx) * 4 + 2];
  const edgeLum = 0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2];
  assert.ok(
    centerLum > edgeLum,
    `center ${centerLum} should be brighter than edge ${edgeLum}`,
  );
});

// --- Straighten ---

test("straighten produces valid output", async () => {
  const p = await makePng({ w: 64, h: 64, fill: [100, 100, 100, 255] });
  const out = await renderImage(p, recipeSchema.parse({ straighten: 15 }));
  assert.ok(out.length > 0);
});

// --- Recipe validation ---

test("rejects invalid recipe values", async () => {
  const p = await makePng({ w: 8, h: 8, fill: [100, 100, 100, 255] });
  await assert.rejects(
    renderImage(p, { ...neutralRecipe(), exposure: 999 }),
    /Too big/,
  );
  await assert.rejects(
    renderImage(p, { ...neutralRecipe(), rotation: 5 }),
    /Too big/,
  );
});

test("EXIF orientation and crop are applied before the recipe rotation", async () => {
  const p = path.join(dir, "oriented.jpg");
  await sharp({
    create: { width: 60, height: 40, channels: 3, background: "#606060" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(p);
  assert.deepEqual(
    [(await inspectImage(p)).width, (await inspectImage(p)).height],
    [40, 60],
  );
  const out = await renderImage(
    p,
    recipeSchema.parse({
      rotation: 1,
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
    }),
  );
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 30);
  assert.equal(meta.height, 40);
});

test("one EV doubles linear light rather than gamma encoded channel values", async () => {
  const p = await makePng({ w: 4, h: 4, fill: [100, 100, 100, 255] });
  const out = await centerPixel(
    await renderImage(p, recipeSchema.parse({ exposure: 1 })),
  );
  const lin = ((100 / 255 + 0.055) / 1.055) ** 2.4;
  const expected = Math.round((1.055 * (lin * 2) ** (1 / 2.4) - 0.055) * 255);
  assert.ok(Math.abs(out.r - expected) <= 1);
  assert.ok(out.r < 180);
});
