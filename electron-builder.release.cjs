const { readVersion } = require("./scripts/release-version.cjs");
const { version, packageVersion } = readVersion();
module.exports = {
  ...require("./package.json").build,
  extraMetadata: { version: packageVersion },
  buildVersion: version,
  artifactName: `Lumaflux-${version}-\${os}-\${arch}.\${ext}`,
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.photography",
    identity: null,
  },
  win: { target: ["nsis"], signAndEditExecutable: false },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
  },
  linux: {
    target: ["AppImage", "deb"],
    category: "Graphics",
    maintainer: "IT-PSAPE",
    executableName: "lumaflux",
  },
  publish: null,
};
