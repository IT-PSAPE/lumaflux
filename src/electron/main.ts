import { imageExtensions } from "../shared/formats.js";
import { app, BrowserWindow, ipcMain, dialog, protocol } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  realpath,
  stat,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { LatestPreview } from "../core/preview.js";
import { PhotoService } from "../core/service.js";
import { Commands } from "../core/commands.js";
import { RenderPool } from "../imaging/pool.js";
import { startMcp } from "../mcp/server.js";
const here = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lumaflux",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
if (process.env.LUMAFLUX_DATA_DIR)
  app.setPath("userData", process.env.LUMAFLUX_DATA_DIR);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window: BrowserWindow | undefined;
  let pool: RenderPool;
  let commands: Commands | undefined;
  let quitting = false;
  let settingsTail: Promise<unknown> = Promise.resolve();
  let mcp: Awaited<ReturnType<typeof startMcp>> | undefined;
  let settings = { enabled: false, roots: [] as string[] };
  const token = randomBytes(32).toString("hex");
  const dataDir = app.getPath("userData");
  const configPath = path.join(dataDir, "mcp-connection.json");
  const settingsPath = path.join(dataDir, "settings.json");
  const clientConfig = () =>
    JSON.stringify(
      {
        mcpServers: {
          lumaflux: {
            command: "node",
            args: [
              app.isPackaged
                ? path.join(process.resourcesPath, "mcp/stdio.mjs")
                : path.join(here, "../mcp/stdio.js"),
              configPath,
            ],
          },
        },
      },
      null,
      2,
    );
  const agentState = () => ({
    ...settings,
    endpoint: mcp?.url,
    configPath,
    clientConfig: clientConfig(),
  });
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      await mkdir(dataDir, { recursive: true });
      pool = new RenderPool();
      const service = await PhotoService.open(
        path.join(dataDir, "catalog.json"),
      );
      const activeCommands = new Commands(service, (p, r, o) =>
        pool.render(p, r, o),
      );
      commands = activeCommands;
      const configure = (enabled: boolean, roots: string[]) => {
        const update = settingsTail.then(async () => {
          if (quitting) throw new Error("Lumaflux is shutting down");
          const canonical = await Promise.all(
            roots.map(async (r) => {
              const p = await realpath(r);
              if (!(await stat(p)).isDirectory())
                throw new Error("Agent roots must be folders");
              return p;
            }),
          );
          if (mcp) {
            await mcp.close();
            mcp = undefined;
          }
          await unlink(configPath).catch(() => {});
          settings = { enabled: false, roots: canonical };
          if (enabled) {
            if (!canonical.length)
              throw new Error("Add an allowed folder before enabling agents");
            mcp = await startMcp(activeCommands, { token, roots: canonical });
            await writeFile(
              configPath,
              JSON.stringify({ url: mcp.url, token }),
              {
                mode: 0o600,
              },
            );
            settings.enabled = true;
          }
          const tmp = `${settingsPath}.tmp`;
          await writeFile(tmp, JSON.stringify(settings), { mode: 0o600 });
          await rename(tmp, settingsPath);
          return agentState();
        });
        settingsTail = update.catch(() => {});
        return update;
      };
      try {
        const saved = z
          .object({ enabled: z.boolean(), roots: z.array(z.string()) })
          .parse(JSON.parse(await readFile(settingsPath, "utf8")));
        await configure(saved.enabled, saved.roots);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT")
          console.error(
            "Agent settings could not be restored:",
            (e as Error).message,
          );
      }
      const thumbs = new Map<string, Buffer>();
      const pending = new Map<string, Promise<Buffer>>();
      protocol.handle("lumaflux", async (req) => {
        try {
          const url = new URL(req.url);
          if (url.hostname !== "asset")
            return new Response(null, { status: 404 });
          const id = decodeURIComponent(url.pathname.slice(1));
          const p = service.photo(id);
          const key = `${id}:${p.revision}:${p.path}`;
          let bytes = thumbs.get(key);
          if (!bytes) {
            let work = pending.get(key);
            if (!work) {
              work = activeCommands.preview(id, p.recipe, 360);
              pending.set(key, work);
            }
            try {
              bytes = await work;
              thumbs.set(key, bytes);
              while (thumbs.size > 160)
                thumbs.delete(thumbs.keys().next().value!);
            } finally {
              pending.delete(key);
            }
          }
          return new Response(new Uint8Array(bytes), {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      });
      const rendererPath = path.join(here, "../renderer/index.html");
      function handle(name: string, fn: (...args: any[]) => unknown) {
        ipcMain.handle(name, (event, ...args) => {
          if (
            event.sender !== window?.webContents ||
            event.senderFrame !== window?.webContents.mainFrame
          )
            throw new Error("Invalid IPC sender");
          return fn(...args);
        });
      }
      handle("command", (name, args) =>
        activeCommands.run(z.string().parse(name), args),
      );
      const previewQueue = new LatestPreview(
        async ({
          id,
          recipe,
          maxDimension,
        }: {
          id: string;
          recipe: unknown;
          maxDimension?: number;
        }) =>
          `data:image/jpeg;base64,${(await activeCommands.preview(id, recipe, maxDimension)).toString("base64")}`,
      );
      handle("preview", (id, recipe, maxDimension) =>
        previewQueue.request({
          id: z.string().parse(id),
          recipe,
          maxDimension,
        }),
      );
      handle(
        "choose-import",
        async (folder = false) =>
          (
            await dialog.showOpenDialog(window!, {
              properties: folder
                ? ["openDirectory"]
                : ["openFile", "multiSelections"],
              filters: folder
                ? undefined
                : [
                    {
                      name: "Photos",
                      extensions: imageExtensions,
                    },
                  ],
            })
          ).filePaths,
      );
      handle(
        "choose-directory",
        async () =>
          (
            await dialog.showOpenDialog(window!, {
              properties: ["openDirectory", "createDirectory"],
            })
          ).filePaths[0] ?? null,
      );
      handle(
        "choose-relink",
        async () =>
          (
            await dialog.showOpenDialog(window!, {
              properties: ["openFile"],
              filters: [
                {
                  name: "Photos",
                  extensions: imageExtensions,
                },
              ],
            })
          ).filePaths[0] ?? null,
      );
      handle("agent-settings", agentState);
      handle("update-agent-settings", (enabled, roots) =>
        configure(
          z.boolean().parse(enabled),
          z.array(z.string()).max(50).parse(roots),
        ),
      );
      const createWindow = async () => {
        window = new BrowserWindow({
          width: 1440,
          height: 960,
          minWidth: 1060,
          minHeight: 700,
          title: "Lumaflux",
          backgroundColor: "#171819",
          webPreferences: {
            preload: path.join(here, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (e) => e.preventDefault());
        await window.loadFile(rendererPath);
      };
      service.on("change", () => {
        if (window && !window.isDestroyed())
          window.webContents.send("catalog-change");
      });
      await createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      });
    })
    .catch((e) => {
      dialog.showErrorBox(
        "Lumaflux could not start",
        (e as Error).stack ?? String(e),
      );
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (async () => {
      try {
        for (const job of commands?.service.jobs ?? [])
          if (job.status === "queued" || job.status === "running")
            commands?.exports.cancel(job.id);
        await settingsTail;
        await mcp?.close();
        await pool?.close();
        await commands?.exports.idle();
        await commands?.service.idle();
        await unlink(configPath).catch(() => {});
      } finally {
        app.quit();
      }
    })();
  });
}
