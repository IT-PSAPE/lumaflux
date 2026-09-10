# Desktop releases

The public repository is https://github.com/IT-PSAPE/lumaflux.

Change `version` in the root `release.yaml` and push to `main`. The Desktop release workflow validates, builds, and launches the packaged app on Windows x64, Linux x64, macOS Intel, and macOS Apple Silicon. All matrix jobs must pass before a GitHub release is published. The release includes installers and SHA-256 checksums; UI test screenshots remain available as workflow artifacts.

The first release is `0.10.0.1` (tag `v0.10.0.1`). Four-part release numbers are mapped to the valid internal SemVer version `0.10.0+1`; the fourth component is retained in build metadata, release names, and filenames. The YAML file is authoritative for release builds; package.json's development version does not need to be changed for each release.

Workflow/configuration changes also retrigger unpublished versions for repairs, and the workflow can be dispatched manually on main. Already published versions are skipped, so bump the YAML to ship new code. A partial upload stays as a draft until all files upload successfully. A failed build publishes nothing. To retry code-only fixes for an unpublished version, push the fix and dispatch Desktop release against main.

Run `npm run package:release` to build the current platform locally. Release builds are unsigned; macOS is not notarized. Signing certificates can be added later without changing the version-file process. Linux supports x64 AppImage and .deb, Windows supports an x64 NSIS installer, and each macOS architecture has a DMG and ZIP.

Configuration follows the [electron-builder GitHub Actions guide](https://www.electron.build/docs/github-actions/). Third-party actions are pinned to commit hashes and publishing permissions are limited to the final job.
