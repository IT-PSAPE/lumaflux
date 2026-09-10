import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PhotoService } from "../src/core/service.js";

test("catalog preserves originals, persists edits, rejects conflicts and atomically validates batches", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-core-"));
  const source = path.join(dir, "image.png");
  await sharp({
    create: { width: 40, height: 20, channels: 3, background: "#786050" },
  })
    .png()
    .toFile(source);
  const before = await readFile(source);
  const service = await PhotoService.open(path.join(dir, "catalog.json"));
  const result = await service.importPaths([source, source]);
  assert.equal(result.imported.length, 1);
  const photo = service.state().photos[0];
  await service.edit([
    { id: photo.id, expectedRevision: 0, patch: { exposure: 1 } },
  ]);
  await assert.rejects(
    service.edit([
      { id: photo.id, expectedRevision: 0, patch: { exposure: 2 } },
    ]),
    /CONFLICT/,
  );
  await assert.rejects(
    service.edit([
      { id: photo.id, expectedRevision: 1, patch: { brightness: 20 } },
      { id: "missing", expectedRevision: 0, patch: { brightness: 20 } },
    ]),
    /NOT_FOUND/,
  );
  assert.equal(service.photo(photo.id).recipe.brightness, 0);
  await service.history(photo.id, 1, "undo");
  assert.equal(service.photo(photo.id).recipe.exposure, 0);
  await service.history(photo.id, 2, "redo");
  assert.equal(service.photo(photo.id).recipe.exposure, 1);
  await service.metadata(photo.id, { rating: 5, favorite: true });
  const reopened = await PhotoService.open(path.join(dir, "catalog.json"));
  assert.equal(reopened.photo(photo.id).revision, 3);
  assert.equal(reopened.photo(photo.id).rating, 5);
  assert.deepEqual(await readFile(source), before);
});

test("import reports corrupt images and scans folders without duplicate paths", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-import-"));
  await mkdir(path.join(dir, "nested"));
  await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toFile(path.join(dir, "nested", "ok.png"));
  await writeFile(path.join(dir, "bad.jpg"), "bad");
  await writeFile(path.join(dir, "notes.txt"), "ignored");
  const s = await PhotoService.open(path.join(dir, "catalog.json"));
  const r = await s.importPaths([dir]);
  assert.equal(r.imported.length, 1);
  assert.ok(r.errors.some((e) => e.path.endsWith("bad.jpg")));
  assert.equal((await s.importPaths([dir])).imported.length, 0);
});

test("partial recipe patches never reset unrelated adjustments", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-patch-"));
  const file = path.join(dir, "p.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "gray" },
  })
    .png()
    .toFile(file);
  const s = await PhotoService.open(path.join(dir, "catalog.json"));
  await s.importPaths([file]);
  const id = s.state().photos[0].id;
  await s.edit([{ id, expectedRevision: 0, patch: { exposure: 1.5 } }]);
  await s.edit([{ id, expectedRevision: 1, patch: { rotation: 1 } }]);
  assert.equal(s.photo(id).recipe.exposure, 1.5);
  assert.equal(s.photo(id).recipe.rotation, 1);
});

test("failed catalog replacement leaves in-memory edits and prior catalog intact", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-save-"));
  const file = path.join(dir, "p.png"),
    catalog = path.join(dir, "catalog.json");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "red" },
  })
    .png()
    .toFile(file);
  const s = await PhotoService.open(catalog);
  await s.importPaths([file]);
  const p = s.state().photos[0];
  const saved = await readFile(catalog);
  const { rename } = await import("node:fs/promises");
  await rename(catalog, `${catalog}.backup`);
  await mkdir(catalog);
  await assert.rejects(
    s.edit([{ id: p.id, expectedRevision: 0, patch: { exposure: 1 } }]),
  );
  assert.equal(s.photo(p.id).revision, 0);
  assert.equal(s.photo(p.id).recipe.exposure, 0);
  assert.deepEqual(await readFile(`${catalog}.backup`), saved);
});
