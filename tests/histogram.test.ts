import test from "node:test";
import assert from "node:assert/strict";
import {
  histogram,
  clippingPixels,
  samplePixel,
} from "../src/renderer/histogram-data";
test("RGB histogram counts each channel independently and excludes transparent pixels", () => {
  const data = new Uint8ClampedArray([
    0, 10, 255, 255, 255, 10, 0, 255, 0, 0, 0, 0,
  ]);
  const h = histogram(data);
  assert.equal(h.pixels, 2);
  assert.equal(h.channels[0][0], 1);
  assert.equal(h.channels[1][10], 2);
  assert.equal(h.channels[2][255], 1);
  assert.equal(h.shadowChannels, 5);
  assert.equal(h.highlightChannels, 5);
  assert.equal(h.shadows, 2);
  assert.equal(h.highlights, 2);
  for (const bins of h.channels)
    assert.equal(
      bins.reduce((a, b) => a + b, 0),
      2,
    );
});
test("clipping masks and RGB sampling respect bounds, toggles, and alpha", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0,
  ]);
  const mask = clippingPixels(data, true, true);
  assert.deepEqual([...mask.slice(0, 8)], [0, 0, 255, 210, 255, 0, 0, 210]);
  assert.equal(mask[11], 0);
  assert.equal(mask[15], 0);
  assert.ok(clippingPixels(data, false, false).every((v) => v === 0));
  assert.deepEqual(samplePixel(data, 4, 1, 0.3, 0.5), [255, 255, 255]);
  assert.equal(samplePixel(data, 4, 1, 1, 0.5), null);
  assert.equal(samplePixel(data, 4, 1, 0.9, 0.5), null);
});

test("cropped histogram excludes pixels outside the crop", () => {
  const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const h = histogram(data, 2, { x: 0.5, y: 0, width: 0.5, height: 1 });
  assert.equal(h.pixels, 1);
  assert.equal(h.shadows, 0);
  assert.equal(h.highlights, 1);
  assert.equal(h.channels[0][0], 0);
});
