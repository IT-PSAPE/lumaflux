import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
const arch = process.arch;
const executable =
  process.platform === "darwin"
    ? `release/mac${arch === "arm64" ? "-arm64" : ""}/Lumaflux.app/Contents/MacOS/Lumaflux`
    : process.platform === "win32"
      ? "release/win-unpacked/Lumaflux.exe"
      : "release/linux-unpacked/lumaflux";
if (!existsSync(executable))
  throw new Error(`Missing packaged application: ${executable}`);
const env = { ...process.env, LUMAFLUX_EXECUTABLE: path.resolve(executable) };
if (process.platform === "linux") env.LUMAFLUX_E2E_NO_SANDBOX = "1";
const result = spawnSync(process.execPath, ["scripts/e2e.mjs"], {
  stdio: "inherit",
  env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
