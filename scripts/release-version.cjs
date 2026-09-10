const { readFileSync, appendFileSync } = require("node:fs");
const path = require("node:path");
function parseVersion(source) {
  const match = source.match(
    /^version:\s*["']?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))["']?\s*(?:#.*)?$/m,
  );
  if (!match || (source.match(/^version:/gm) || []).length !== 1)
    throw new Error(
      'release.yaml requires one version: "major.minor.patch.revision"',
    );
  const parts = match[1].split(".");
  if (parts.some((p) => Number(p) > 65535))
    throw new Error("Version components must be between 0 and 65535");
  return {
    version: match[1],
    tag: `v${match[1]}`,
    packageVersion: `${parts.slice(0, 3).join(".")}+${parts[3]}`,
  };
}
function readVersion() {
  return parseVersion(
    readFileSync(path.join(__dirname, "../release.yaml"), "utf8"),
  );
}
module.exports = { parseVersion, readVersion };
if (require.main === module) {
  const version = readVersion();
  console.log(JSON.stringify(version));
  if (process.env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(version))
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
