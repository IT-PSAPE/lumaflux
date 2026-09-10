import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PhotoService } from "../src/core/service";
import { neutralRecipe } from "../src/shared/model";
import { renderImage } from "../src/imaging/render";

test("corrections persist, undo and invalidate previews without modifying originals", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lf-corrections-")),
    file = path.join(dir, "photo.png"),
    catalog = path.join(dir, "catalog.json");
  try {
    const data = Buffer.alloc(160 * 120 * 3);
    for (let i = 0; i < data.length; i++) data[i] = (i * 73) % 256;
    await sharp(data, { raw: { width: 160, height: 120, channels: 3 } })
      .png()
      .toFile(file);
    const source = await readFile(file);
    const service = await PhotoService.open(catalog);
    await service.importPaths([file]);
    const p = service.state().photos[0];
    await service.edit([
      {
        id: p.id,
        expectedRevision: 0,
        patch: { crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      },
    ]);
    const patch = {
      lensDistortion: 45,
      lensVignette: 20,
      lensRed: 5,
      lensBlue: -5,
      noiseLuminance: 60,
      noiseColor: 70,
    };
    await service.edit([{ id: p.id, expectedRevision: 1, patch }]);
    assert.equal(service.photo(p.id).recipe.crop, null);
    const reopened = await PhotoService.open(catalog);
    assert.equal(reopened.photo(p.id).recipe.noiseColor, 70);
    const recipe = reopened.photo(p.id).recipe,
      opts = { format: "png" as const, maxDimension: 160, preview: true };
    const edited = await renderImage(file, recipe, opts),
      neutral = await renderImage(file, neutralRecipe(), opts);
    assert.notDeepEqual(edited, neutral);
    assert.deepEqual(
      await renderImage(file, recipe, { format: "png", maxDimension: 160 }),
      edited,
    );
    assert.deepEqual(await renderImage(file, recipe, opts), edited);
    assert.notDeepEqual(
      await renderImage(file, { ...recipe, lensDistortion: -45 }, opts),
      edited,
    );
    assert.notDeepEqual(
      await renderImage(
        file,
        { ...recipe, noiseLuminance: 0, noiseColor: 0 },
        opts,
      ),
      edited,
    );
    await reopened.history(p.id, 2, "undo", "UI");
    assert.equal(reopened.photo(p.id).recipe.noiseColor, 0);
    assert.ok(reopened.photo(p.id).recipe.crop);
    assert.deepEqual(await readFile(file), source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
