import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PhotoService } from "../src/core/service.js";
import { Commands } from "../src/core/commands.js";
import { renderImage } from "../src/imaging/render.js";
import { startMcp } from "../src/mcp/server.js";
test("MCP authenticates, discovers, edits, previews and rejects stale/out-of-root requests", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-mcp-"));
  const source = path.join(dir, "sample.png");
  await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toFile(source);
  const s = await PhotoService.open(path.join(dir, "catalog.json"));
  const commands = new Commands(s, renderImage);
  const server = await startMcp(commands, {
    token: "test-secret",
    roots: [dir],
  });
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  try {
    assert.equal((await fetch(server.url, { method: "POST" })).status, 401);
    assert.equal(
      (
        await fetch(server.url, {
          method: "POST",
          headers: {
            Authorization: "Bearer test-secret",
            Origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: { Authorization: "Bearer test-secret" } },
      }),
    );
    let notified = false;
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, () => {
      notified = true;
    });
    await client.subscribeResource({ uri: "lumaflux://app/state" });
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "apply_batch_edits"));
    const imported = await client.callTool({
      name: "import_photos",
      arguments: { paths: [source] },
    });
    assert.ok(!imported.isError);
    const p = s.state().photos[0];
    assert.ok(tools.tools.some((t) => t.name === "suggest_adjustments"));
    const guide = await client.callTool({
      name: "get_editing_guide",
      arguments: {},
    });
    assert.match(JSON.stringify(guide), /composition/);
    const resources = await client.listResources();
    assert.ok(
      resources.resources.some(
        (r) => r.uri === "lumaflux://guides/professional-editing",
      ),
    );
    const prompts = await client.listPrompts();
    assert.ok(
      prompts.prompts.some((p) => p.name === "professional-photo-edit"),
    );
    const analysis = await client.callTool({
      name: "analyze_photo",
      arguments: { id: p.id },
    });
    assert.ok(!analysis.isError);
    assert.match(JSON.stringify(analysis), /percentiles/);
    const match = await client.callTool({
      name: "auto_lens_correction",
      arguments: { id: p.id, expectedRevision: 0 },
    });
    assert.ok(!match.isError);
    assert.equal(s.photo(p.id).revision, 0);
    const candidate = await client.callTool({
      name: "get_preview",
      arguments: {
        id: p.id,
        original: true,
        uncropped: true,
        patch: { exposure: 1, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      },
    });
    assert.ok(!candidate.isError);
    assert.equal(s.photo(p.id).revision, 0);
    const suggestion = await client.callTool({
      name: "suggest_adjustments",
      arguments: { id: p.id },
    });
    assert.ok(!suggestion.isError);
    assert.equal(s.photo(p.id).revision, 0);
    assert.ok(
      !(
        await client.callTool({
          name: "apply_edits",
          arguments: {
            id: p.id,
            expectedRevision: 0,
            patch: {
              exposure: 1,
              noiseLuminance: 40,
              noiseColor: 50,
              lensDistortion: 20,
              lensVignette: 30,
              lensRed: 5,
              lensBlue: -5,
            },
          },
        })
      ).isError,
    );
    assert.equal(s.photo(p.id).recipe.exposure, 1);
    assert.equal(s.photo(p.id).recipe.noiseColor, 50);
    assert.equal(s.photo(p.id).recipe.lensDistortion, 20);
    const capabilities = await client.callTool({
      name: "get_capabilities",
      arguments: {},
    });
    assert.ok(JSON.stringify(capabilities).includes("noiseLuminance"));
    assert.ok(JSON.stringify(capabilities).includes("lensDistortion"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(notified, true);
    await client.unsubscribeResource({ uri: "lumaflux://app/state" });
    assert.equal(
      (
        await client.callTool({
          name: "apply_edits",
          arguments: { id: p.id, expectedRevision: 0, patch: { exposure: 2 } },
        })
      ).isError,
      true,
    );
    const preview = await client.callTool({
      name: "get_preview",
      arguments: { id: p.id },
    });
    assert.ok((preview.content as any[]).some((c) => c.type === "image"));
    assert.equal(
      (
        await client.callTool({
          name: "import_photos",
          arguments: { paths: ["/etc/hosts"] },
        })
      ).isError,
      true,
    );
    assert.ok((await client.listResources()).resources.length > 0);
  } finally {
    await client.close();
    await server.close();
  }
});

test("allowed-root validation resolves symlinks and rejects sibling-prefix paths", async () => {
  const { assertAllowed } = await import("../src/mcp/server.js");
  const { mkdir, symlink, writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(tmpdir(), "lumaflux-roots-"));
  const allowed = path.join(dir, "photos"),
    sibling = path.join(dir, "photos-secret");
  await mkdir(allowed);
  await mkdir(sibling);
  const file = path.join(sibling, "private.txt");
  await writeFile(file, "private");
  await symlink(file, path.join(allowed, "escape.txt"));
  await assert.rejects(assertAllowed(file, [allowed]), /PATH_DENIED/);
  await assert.rejects(
    assertAllowed(path.join(allowed, "escape.txt"), [allowed]),
    /PATH_DENIED/,
  );
  assert.equal(
    await assertAllowed(allowed, [allowed]),
    await (await import("node:fs/promises")).realpath(allowed),
  );
});
