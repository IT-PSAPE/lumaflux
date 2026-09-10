import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
async function poll(fn) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("Condition timed out");
}
const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), "lumaflux-e2e-"));
await mkdir(path.join(temp, "exports"));
await mkdir("output/playwright", { recursive: true });
const source = path.join(temp, "color-study.png"),
  source2 = path.join(temp, "warm-study.png");
const pixels = Buffer.alloc(1200 * 800 * 3);
for (let y = 0; y < 800; y++)
  for (let x = 0; x < 1200; x++) {
    const i = (y * 1200 + x) * 3;
    pixels[i] = Math.round((x / 1200) * 220 + 20);
    pixels[i + 1] = Math.round((y / 800) * 190 + 30);
    pixels[i + 2] = Math.round((1 - x / 1200) * 160 + 30);
  }
await sharp(pixels, { raw: { width: 1200, height: 800, channels: 3 } })
  .png()
  .toFile(source);
await sharp(pixels, { raw: { width: 1200, height: 800, channels: 3 } })
  .modulate({ hue: 55 })
  .png()
  .toFile(source2);
const original = await readFile(source);
const launchOptions = {
  ...(process.env.LUMAFLUX_EXECUTABLE
    ? { executablePath: process.env.LUMAFLUX_EXECUTABLE, args: [] }
    : { args: ["."] }),
  env: { ...process.env, LUMAFLUX_DATA_DIR: path.join(temp, "data") },
  timeout: 30000,
};
const app = await electron.launch(launchOptions);
let client;
let stdioClient;
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByText("A little room for your photos.").waitFor();
  await page.screenshot({ path: "output/playwright/empty.png" });
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: paths,
      });
    },
    [source, source2],
  );
  await page
    .getByRole("button", { name: "Import photos", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Select color-study.png", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".photo-image img")).every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  assert.equal(await page.locator(".adjustments").count(), 0);
  assert.equal(await page.locator(".navigation").count(), 0);
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, temp);
  await page
    .getByRole("button", { name: "Explore folders", exact: true })
    .click();
  await page.getByRole("button", { name: "exports", exact: true }).click();
  await page
    .getByRole("button", { name: "Parent folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import this folder", exact: true })
    .waitFor();
  const left = await page.locator(".navigation").boundingBox();
  await page.getByRole("separator", { name: "Resize left panel" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.ok(
    (await page.locator(".navigation").boundingBox()).width > left.width,
  );
  await page.getByRole("button", { name: "Folders", exact: true }).click();
  await page.screenshot({ path: "output/playwright/gallery.png" });
  await page
    .getByRole("button", { name: "Favorite color-study.png", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rate color-study.png 5", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select color-study.png", exact: true })
    .dblclick();
  await page.locator(".image-wrap img").waitFor();
  const right = await page.locator(".inspector-shell").boundingBox();
  await page.getByRole("separator", { name: "Resize right panel" }).focus();
  await page.keyboard.press("ArrowLeft");
  assert.ok(
    (await page.locator(".inspector-shell").boundingBox()).width > right.width,
  );
  await page.getByRole("tab", { name: "Info", exact: true }).click();
  await page.getByText("File information", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("slider", { name: "Exposure", exact: true }).count(),
    0,
  );
  await page.getByRole("tab", { name: "Adjustments", exact: true }).click();
  await page.getByRole("slider", { name: "Exposure", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await poll(() =>
    page.evaluate(async () => {
      const s = await window.lumaflux.command("get_app_state");
      return (
        s.photos.find((p) => p.name === "color-study.png").recipe.exposure > 0
      );
    }),
  );
  let state = await page.evaluate(() =>
    window.lumaflux.command("get_app_state"),
  );
  const id = state.photos.find((p) => p.name === "color-study.png").id;
  assert.equal(await page.locator(".navigation").count(), 0);
  assert.equal(await page.locator(".library-toolbar").count(), 0);
  await page.getByRole("tab", { name: "Composition", exact: true }).click();
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await poll(() =>
    page.evaluate(
      async (id) =>
        (await window.lumaflux.command("get_photo", { id })).recipe.rotation ===
        1,
      id,
    ),
  );
  await page.getByLabel("Lock aspect ratio").check();
  await page.waitForFunction(
    () =>
      document.querySelector(".image-wrap img")?.complete &&
      !document.querySelector(".canvas-status"),
  );
  const image = await page.locator(".image-wrap img").boundingBox();
  assert.ok(image && image.width > 0);
  await page.mouse.move(image.x + image.width, image.y + image.height);
  await page.mouse.down();
  await page.mouse.move(
    image.x + image.width * 0.8,
    image.y + image.height * 0.8,
    { steps: 5 },
  );
  await page.mouse.up();

  await poll(() =>
    page.evaluate(
      async (id) =>
        !!(await window.lumaflux.command("get_photo", { id })).recipe.crop,
      id,
    ),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await poll(() =>
    page.evaluate(
      async (id) =>
        (await window.lumaflux.command("get_photo", { id })).recipe.crop ===
        null,
      id,
    ),
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await poll(() =>
    page.evaluate(
      async (id) =>
        !!(await window.lumaflux.command("get_photo", { id })).recipe.crop,
      id,
    ),
  );
  await page.screenshot({ path: "output/playwright/composition.png" });
  await page.getByRole("slider", { name: "Straighten", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await poll(() =>
    page.evaluate(
      async (id) =>
        (await window.lumaflux.command("get_photo", { id })).recipe.straighten >
        0,
      id,
    ),
  );
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.locator(".compare-pane figcaption").waitFor();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(".compare-pane img")];
    return (
      images.length === 2 &&
      images.every((img) => img.complete) &&
      images[0].src !== images[1].src
    );
  });
  await page.screenshot({ path: "output/playwright/compare.png" });
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("tab", { name: "Adjustments", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await page.waitForFunction(() => {
    const img = document.querySelector(".image-wrap img");
    return (
      img && Math.abs(img.getBoundingClientRect().width - img.naturalWidth) < 2
    );
  });
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".canvas-status"));
  await page.screenshot({ path: "output/playwright/editor.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1060, 700),
  );
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.documentElement.scrollHeight <= window.innerHeight,
    ),
  );
  await page.screenshot({ path: "output/playwright/compact.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 960),
  );
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, temp);
  await page.getByRole("button", { name: "Add folder", exact: true }).click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByText("Agent access is on", { exact: true }).waitFor();
  const connection = JSON.parse(
    await readFile(path.join(temp, "data", "mcp-connection.json"), "utf8"),
  );
  client = new Client({ name: "desktop-smoke", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(connection.url), {
      requestInit: { headers: { Authorization: `Bearer ${connection.token}` } },
    }),
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  state = await page.evaluate(() => window.lumaflux.command("get_app_state"));
  const p = state.photos.find((p) => p.id === id);
  const edited = await client.callTool({
    name: "apply_edits",
    arguments: { id, expectedRevision: p.revision, patch: { saturation: -50 } },
  });
  assert.ok(!edited.isError);
  await page
    .getByRole("slider", { name: "Saturation", exact: true })
    .scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="Saturation"]')?.value === "-50",
  );
  const settings = await page.evaluate(() => window.lumaflux.settings());
  const bridge = JSON.parse(settings.clientConfig).mcpServers.lumaflux;
  stdioClient = new Client({ name: "stdio-smoke", version: "1" });
  await stdioClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: bridge.args,
      cwd: temp,
    }),
  );
  assert.ok(
    (await stdioClient.listTools()).tools.some((t) => t.name === "get_preview"),
  );
  const visual = await stdioClient.callTool({
    name: "get_preview",
    arguments: { id, maxDimension: 400 },
  });
  assert.ok(visual.content.some((c) => c.type === "image"));
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.locator(".filmstrip button").nth(1).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await poll(() =>
    page.evaluate(async () => {
      const s = await window.lumaflux.command("get_app_state");
      return (
        s.photos.find((p) => p.name === "warm-study.png").recipe.saturation ===
        -50
      );
    }),
  );
  const pasted = await page.evaluate(async () => {
    const s = await window.lumaflux.command("get_app_state");
    return s.photos.find((p) => p.name === "warm-study.png");
  });
  assert.equal(pasted.recipe.rotation, 0);
  assert.equal(pasted.recipe.crop, null);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply to selected", exact: true })
    .click();
  await poll(() =>
    page.evaluate(async () => {
      const s = await window.lumaflux.command("get_app_state");
      return s.photos.every((p) => p.recipe.saturation === -50);
    }),
  );
  await page.getByRole("button", { name: "Export (2)", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Export destination" })
    .fill(path.join(temp, "exports"));
  await page
    .getByRole("button", { name: "Export photos", exact: true })
    .click();
  await poll(() =>
    page.evaluate(async () => {
      const s = await window.lumaflux.command("get_app_state");
      return s.jobs[0]?.status === "completed";
    }),
  );
  state = await page.evaluate(() => window.lumaflux.command("get_app_state"));
  console.log("Export jobs", JSON.stringify(state.jobs));
  assert.equal(state.jobs[0].outputs.length, 2);
  assert.equal(state.jobs[0].errors.length, 0);
  for (const file of state.jobs[0].outputs)
    assert.equal((await sharp(file).metadata()).format, "jpeg");
  assert.deepEqual(await readFile(source), original);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "output/playwright/exports.png" });
  console.log(
    JSON.stringify(
      {
        passed: true,
        temp,
        photos: state.photos.length,
        outputs: state.jobs[0].outputs,
        screenshots: path.join(root, "output/playwright"),
      },
      null,
      2,
    ),
  );
} finally {
  await stdioClient?.close();
  await client?.close();
  await app.close();
}

// Relaunch against the real persisted catalog, detect a moved original, then relink it through UI.
const relocated = path.join(temp, "relocated.png");
await rename(source, relocated);
const reopened = await electron.launch(launchOptions);
try {
  const page = await reopened.firstWindow();
  await page
    .getByRole("button", { name: "Select color-study.png", exact: true })
    .waitFor();
  const stored = await page.evaluate(() =>
    window.lumaflux.command("get_app_state"),
  );
  const photo = stored.photos.find((p) => p.name === "color-study.png");
  assert.equal(stored.photos.length, 2);
  assert.equal(photo.favorite, true);
  assert.equal(photo.rating, 5);
  assert.ok(photo.history.length > 0);
  assert.equal(photo.missing, true);
  await page
    .getByRole("button", { name: "Select color-study.png", exact: true })
    .dblclick();
  await reopened.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, relocated);
  await page
    .getByRole("button", { name: "Relink original", exact: true })
    .click();
  await poll(() =>
    page.evaluate(async () => {
      const s = await window.lumaflux.command("get_app_state");
      return s.photos.some((p) => p.name === "relocated.png" && !p.missing);
    }),
  );
  assert.deepEqual(await readFile(relocated), original);
  console.log(
    "Relaunch, persisted history/metadata, missing-file detection, and relink passed.",
  );
} finally {
  await reopened.close();
}
