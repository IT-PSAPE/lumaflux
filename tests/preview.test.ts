import { test } from "node:test";
import assert from "node:assert/strict";
import { LatestPreview } from "../src/core/preview.js";
test("preview scheduling keeps only the newest waiting request", async () => {
  const started: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const queue = new LatestPreview(async (value: number) => {
    started.push(value);
    if (value === 1) await gate;
    return value;
  });
  const first = queue.request(1);
  const second = queue.request(2);
  const rejected = assert.rejects(second, /SUPERSEDED/);
  const third = queue.request(3);
  release();
  assert.equal(await first, 1);
  await rejected;
  assert.equal(await third, 3);
  assert.deepEqual(started, [1, 3]);
});
