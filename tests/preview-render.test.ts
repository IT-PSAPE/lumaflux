import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ByteCache } from "../src/imaging/cache";
import { renderImage } from "../src/imaging/render";
import { neutralRecipe } from "../src/shared/model";
test("preview cache evicts least-recent entries and bypasses oversized buffers", () => {
  const cache = new ByteCache<string>(10);
  cache.set("a", "A", 5);
  cache.set("b", "B", 5);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C", 5);
  assert.equal(cache.get("b"), undefined);
  cache.set("large", "Large", 11);
  assert.equal(cache.get("large"), undefined);
  assert.equal(cache.get("a"), "A");
});
test("preview caches preserve source pixels across edits and invalidate replaced files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lf-preview-"));
  const file = path.join(dir, "source.png");
  try {
    await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#bb5533" },
    })
      .png()
      .toFile(file);
    const options = {
      format: "png" as const,
      maxDimension: 160,
      preview: true,
    };
    const recipe = { ...neutralRecipe(), straighten: 5 };
    const before = await renderImage(file, recipe, options);
    const edited = await renderImage(file, { ...recipe, exposure: 1 }, options);
    assert.notDeepEqual(before, edited);
    assert.deepEqual(await renderImage(file, recipe, options), before);
    assert.deepEqual(
      before,
      await renderImage(file, recipe, { format: "png", maxDimension: 160 }),
    );
    await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#33aaff" },
    })
      .png()
      .toFile(file);
    assert.notDeepEqual(await renderImage(file, recipe, options), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
