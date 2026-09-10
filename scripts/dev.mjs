import { spawn } from "node:child_process";
const build = spawn(process.execPath, ["scripts/build.mjs"], {
  stdio: "inherit",
});
build.on("exit", (code) => {
  if (code) process.exit(code);
  const electron = spawn("node_modules/.bin/electron", ["."], {
    stdio: "inherit",
    env: process.env,
  });
  electron.on("exit", (code) => process.exit(code ?? 0));
});
