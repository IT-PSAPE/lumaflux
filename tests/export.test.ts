import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PhotoService } from "../src/core/service.js";
import { ExportManager } from "../src/core/export.js";
import { renderImage } from "../src/imaging/render.js";
test("export snapshots recipes, resizes, and never overwrites sources or existing files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-export-"));
  const source = path.join(dir, "photo.png");
  await sharp({
    create: { width: 80, height: 40, channels: 3, background: "#505050" },
  })
    .png()
    .toFile(source);
  const original = await readFile(source);
  const s = await PhotoService.open(path.join(dir, "catalog.json"));
  await s.importPaths([source]);
  const p = s.state().photos[0];
  const exports = new ExportManager(s, renderImage);
  const options = {
    ids: [p.id],
    directory: dir,
    format: "png" as const,
    quality: 90,
    maxDimension: 32,
    suffix: "",
  };
  const j = await exports.start(options);
  await exports.idle();
  const result = exports.get(j.id);
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.length, 1);
  assert.notEqual(result.outputs[0], source);
  assert.equal((await sharp(result.outputs[0]).metadata()).width, 32);
  assert.deepEqual(await readFile(source), original);
  const j2 = await exports.start(options);
  await exports.idle();
  assert.notEqual(exports.get(j2.id).outputs[0], result.outputs[0]);
});

test("queued export cancellation and missing-file failures have explicit outcomes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-cancel-"));
  const file = path.join(dir, "photo.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toFile(file);
  const s = await PhotoService.open(path.join(dir, "catalog.json"));
  await s.importPaths([file]);
  const id = s.state().photos[0].id;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const manager = new ExportManager(s, async (...args) => {
    await gate;
    return renderImage(...args);
  });
  const opts = {
    ids: [id],
    directory: dir,
    format: "png" as const,
    quality: 90,
    suffix: "-copy",
  };
  const first = await manager.start(opts);
  const second = await manager.start(opts);
  manager.cancel(second.id);
  release();
  await manager.idle();
  assert.equal(manager.get(first.id).status, "completed");
  assert.equal(manager.get(second.id).status, "cancelled");
  assert.equal(manager.get(second.id).outputs.length, 0);
  const { unlink } = await import("node:fs/promises");
  await unlink(file);
  const third = await manager.start(opts);
  await manager.idle();
  assert.equal(manager.get(third.id).status, "failed");
  assert.equal(manager.get(third.id).errors.length, 1);
});
