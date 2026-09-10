import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { RenderPool } from "../src/imaging/pool.js";
import { neutralRecipe } from "../src/shared/model.js";
test("workers return decodable buffers under concurrent load and reject after shutdown", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-pool-"));
  const file = path.join(dir, "p.png");
  await sharp({
    create: { width: 16, height: 8, channels: 3, background: "blue" },
  })
    .png()
    .toFile(file);
  const pool = new RenderPool();
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        pool.render(file, neutralRecipe(), { format: "png" }),
      ),
    );
    for (const result of results) {
      assert.ok(Buffer.isBuffer(result));
      assert.equal((await sharp(result).metadata()).width, 16);
    }
  } finally {
    await pool.close();
  }
  await assert.rejects(pool.render(file, neutralRecipe()), /closed/);
});
