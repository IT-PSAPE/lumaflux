import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PhotoService } from "../src/core/service";
import { Commands } from "../src/core/commands";
import { renderImage, inspectImage } from "../src/imaging/render";
import { editingGuide } from "../src/mcp/editing-guide";
test("Auto commands preserve originals, use JPEG metadata, retain history and reject stale edits", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lumaflux-auto-command-"));
  try {
    const file = path.join(dir, "camera.jpg");
    const pixels = Buffer.alloc(96 * 64 * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = 20 + (i % 96);
    await sharp(pixels, { raw: { width: 96, height: 64, channels: 3 } })
      .withExif({
        IFD0: { Make: "Canon", Model: "Canon EOS 5D Mark II" },
        IFD2: {
          LensModel: "Canon EF 50mm f/1.8 II",
          FocalLength: "50/1",
          FNumber: "4/1",
        },
      })
      .jpeg()
      .toFile(file);
    const original = await readFile(file),
      info = await inspectImage(file);
    assert.match(info.metadata!.Lens, /50mm/);
    const service = await PhotoService.open(path.join(dir, "catalog.json"));
    await service.importPaths([file]);
    const p = service.state().photos[0],
      commands = new Commands(service, renderImage);
    const match: any = await commands.run("get_lens_match", { id: p.id });
    assert.ok(match.profile, match.message);
    await commands.run("auto_lens_correction", {
      id: p.id,
      expectedRevision: 0,
    });
    assert.ok(service.photo(p.id).recipe.lensProfile);
    const preview = await renderImage(file, service.photo(p.id).recipe, {
      preview: true,
      maxDimension: 96,
    });
    assert.ok(preview.length);
    const persisted = await PhotoService.open(path.join(dir, "catalog.json"));
    assert.deepEqual(
      persisted.photo(p.id).recipe.lensProfile,
      service.photo(p.id).recipe.lensProfile,
    );
    await assert.rejects(
      commands.run("auto_adjust", { id: p.id, expectedRevision: 0 }),
      /REVISION_CONFLICT/,
    );
    const suggested: any = await commands.run("suggest_adjustments", {
      id: p.id,
    });
    assert.equal(service.photo(p.id).revision, 1);
    assert.equal(suggested.expectedRevision, 1);
    await commands.run("auto_adjust", { id: p.id, expectedRevision: 1 });
    assert.equal(service.photo(p.id).revision, 2);
    assert.ok(service.photo(p.id).recipe.lensProfile);
    await commands.run("undo", { id: p.id, expectedRevision: 2 });
    assert.equal(service.photo(p.id).recipe.exposure, 0);
    assert.ok(service.photo(p.id).recipe.lensProfile);
    let concurrent = false;
    const delayed = new Commands(service, async (...args) => {
      if (!concurrent) {
        concurrent = true;
        await service.edit(
          [{ id: p.id, expectedRevision: 3, patch: { exposure: 0.4 } }],
          "concurrent editor",
        );
      }
      return renderImage(...args);
    });
    await assert.rejects(
      delayed.run("auto_adjust", { id: p.id, expectedRevision: 3 }),
      /CONFLICT/,
    );
    assert.equal(service.photo(p.id).recipe.exposure, 0.4);
    assert.deepEqual(await readFile(file), original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Packaged MCP guide and installable skill remain identical", async () => {
  assert.equal(
    await readFile("skills/professional-photo-editing/SKILL.md", "utf8"),
    editingGuide,
  );
  assert.match(editingGuide, /composition/i);
  assert.match(editingGuide, /8-bit/);
  assert.match(editingGuide, /referenceId/);
});
