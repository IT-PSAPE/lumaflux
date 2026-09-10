import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { parseVersion } = createRequire(import.meta.url)(
  "../scripts/release-version.cjs",
);
test("release YAML retains four-part tags and maps to SemVer package versions", () => {
  assert.deepEqual(parseVersion('# release\nversion: "0.10.0.1"\n'), {
    version: "0.10.0.1",
    tag: "v0.10.0.1",
    packageVersion: "0.10.0+1",
  });
  for (const input of [
    "version: 0.1.0",
    "version: 01.1.0.1",
    "version: 1.2.3.999999",
    'version: "bad"',
    "version: 1.2.3.4\nversion: 1.2.3.5",
  ])
    assert.throws(() => parseVersion(input));
});
