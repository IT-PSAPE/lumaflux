import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLensProfile } from "../src/imaging/lens-profiles";
import { correctProfile } from "../src/imaging/profile-render";
import { recipeSchema } from "../src/shared/model";
const metadata = {
  Camera: "Canon Canon EOS 5D Mark II",
  Lens: "Canon EF 50mm f/1.8 II",
  "Focal length": "50 mm",
  Aperture: "f/4",
};
test("lens matching requires metadata and uses calibrated lens/camera, including JPEG EXIF", () => {
  assert.equal(matchLensProfile({}).profile, null);
  assert.equal(
    matchLensProfile({ ...metadata, Lens: "Unknown 50mm" }).profile,
    null,
  );
  const result = matchLensProfile(metadata);
  assert.ok(result.profile, result.message);
  assert.match(result.profile.name, /50mm/);
  assert.equal(result.profile.cameraCrop, 1);
  assert.equal(
    recipeSchema.parse({ lensProfile: result.profile }).lensProfile?.id,
    result.profile.id,
  );
  assert.equal(
    matchLensProfile({ ...metadata, "Focal length": "500 mm" }).profile,
    null,
  );
});
test("calibrated identity preserves bytes; correction stays opaque and does not mutate source", () => {
  const data = Buffer.alloc(80 * 60 * 4, 255);
  for (let i = 0; i < data.length; i += 4) data[i] = ((i / 4) % 80) * 3;
  const profile = matchLensProfile(metadata).profile!;
  const original = Buffer.from(data);
  const out = correctProfile(data, 80, 60, profile);
  assert.deepEqual(data, original);
  assert.notDeepEqual(out, data);
  for (let i = 3; i < out.length; i += 4) assert.equal(out[i], 255);
  const identity = {
    ...profile,
    distortion: {
      model: "poly3" as const,
      terms: [0, 0, 0] as [number, number, number],
    },
    tca: null,
    vignette: null,
  };
  assert.deepEqual(correctProfile(data, 80, 60, identity), data);
});

test("lens matching rejects unknown camera/missing focal rather than inferring equipment", () => {
  assert.equal(
    matchLensProfile({ ...metadata, Camera: "Unknown camera" }).profile,
    null,
  );
  assert.equal(
    matchLensProfile({ ...metadata, "Focal length": "" }).profile,
    null,
  );
  assert.equal(recipeSchema.parse({}).lensProfile, null);
});

test("zoom correction interpolates within calibration range and changes for each focal length", () => {
  const base = {
    Camera: "Canon EOS 7D",
    Lens: "Canon EF-S 10-22mm f/3.5-4.5 USM",
  };
  const at = (n: number) =>
    matchLensProfile({ ...base, "Focal length": `${n} mm` }).profile;
  const a = at(10)!,
    b = at(12)!,
    mid = at(11)!;
  assert.ok(a && b && mid);
  assert.equal(mid.cameraCrop, 1.62);
  a.distortion!.terms.forEach((v, i) =>
    assert.ok(
      Math.abs(mid.distortion!.terms[i] - (v + b.distortion!.terms[i]) / 2) <
        1e-9,
    ),
  );
  assert.notDeepEqual(at(22)!.distortion, a.distortion);
  assert.equal(at(25), null);
});
