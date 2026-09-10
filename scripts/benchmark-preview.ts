import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderImage } from "../src/imaging/render";
import { neutralRecipe } from "../src/shared/model";
const dir = await mkdtemp(path.join(tmpdir(), "lf-bench-"));
try {
  const file = path.join(dir, "24mp.jpg");
  await sharp({
    create: { width: 6000, height: 4000, channels: 3, background: "#bb8877" },
  })
    .jpeg()
    .toFile(file);
  const times: number[] = [];
  const corrections = process.argv.includes("--corrections");
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    await renderImage(
      file,
      {
        ...neutralRecipe(),
        exposure: i * 0.1,
        straighten: 5,
        ...(corrections
          ? {
              lensDistortion: 25,
              lensVignette: 20,
              lensRed: 5,
              lensBlue: -5,
              noiseLuminance: 60,
              noiseColor: 50,
            }
          : {}),
      },
      {
        format: "jpeg",
        maxDimension: 1600,
        ...(process.argv.includes("--preview") ? { preview: true } : {}),
      },
    );
    times.push(Math.round(performance.now() - start));
  }
  console.log(
    JSON.stringify({
      source: "6000×4000 JPEG",
      preview: 1600,
      corrections,
      timesMs: times,
      warmMedianMs: times.slice(1).sort((a, b) => a - b)[3],
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
