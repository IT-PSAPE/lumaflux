import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import type { Recipe, RenderOptions } from "../shared/model.js";
type Job = {
  filePath: string;
  recipe: Recipe;
  options: RenderOptions;
  resolve: (b: Buffer) => void;
  reject: (e: Error) => void;
};
type Slot = { worker: Worker; job?: Job; failed: boolean };
export class RenderPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private closed = false;
  constructor(concurrency = 2) {
    for (let i = 0; i < Math.max(1, Math.min(2, concurrency)); i++)
      this.spawn();
  }
  private spawn() {
    const compiled = new URL("../imaging/worker.js", import.meta.url);
    const source = new URL("../imaging/worker.ts", import.meta.url);
    const built = existsSync(compiled);
    const worker = new Worker(built ? compiled : source, {
      execArgv: built ? [] : ["--import", "tsx"],
    });
    const slot: Slot = { worker, failed: false };
    this.slots.push(slot);
    worker.on(
      "message",
      (msg: { buf?: Uint8Array; error?: string; type?: string }) => {
        if (msg.type === "ready") return;
        const job = slot.job;
        slot.job = undefined;
        if (job) {
          if (msg.error) job.reject(new Error(msg.error));
          else if (msg.buf) job.resolve(Buffer.from(msg.buf));
          else job.reject(new Error("Worker returned no image"));
        }
        this.drain();
      },
    );
    const fail = (error: Error) => {
      if (slot.failed) return;
      slot.failed = true;
      slot.job?.reject(error);
      slot.job = undefined;
      this.slots = this.slots.filter((s) => s !== slot);
      if (!this.closed) {
        for (const job of this.queue) job.reject(error);
        this.queue = [];
      }
    };
    worker.on("error", fail);
    worker.on("exit", (code) => {
      if (!this.closed) fail(new Error(`Image worker stopped (${code})`));
    });
  }
  private drain() {
    for (const slot of this.slots) {
      if (!slot.job && this.queue.length) {
        slot.job = this.queue.shift()!;
        try {
          slot.worker.postMessage({
            id: "render",
            filePath: slot.job.filePath,
            recipe: slot.job.recipe,
            options: slot.job.options,
          });
        } catch (e) {
          slot.job.reject(e as Error);
          slot.job = undefined;
        }
      }
    }
  }
  render(
    filePath: string,
    recipe: Recipe,
    options: RenderOptions = {},
  ): Promise<Buffer> {
    if (this.closed)
      return Promise.reject(new Error("Image workers are closed"));
    if (!this.slots.length)
      return Promise.reject(
        new Error("Image workers stopped. Restart Lumaflux."),
      );
    if (this.queue.length >= 256)
      return Promise.reject(
        new Error("Render queue is full; try again shortly"),
      );
    return new Promise((resolve, reject) => {
      const job = { filePath, recipe, options, resolve, reject };
      // Canvas updates must not wait behind a gallery's queued thumbnails or exports.
      const interactive =
        options.preview !== undefined && (options.maxDimension ?? 1600) > 360;
      if (interactive) {
        const index = this.queue.findIndex(
          (j) =>
            !(
              j.options.preview !== undefined &&
              (j.options.maxDimension ?? 1600) > 360
            ),
        );
        if (index < 0) this.queue.push(job);
        else this.queue.splice(index, 0, job);
      } else this.queue.push(job);
      this.drain();
    });
  }
  async close() {
    this.closed = true;
    const error = new Error("Image workers closed");
    for (const job of this.queue) job.reject(error);
    this.queue = [];
    for (const slot of this.slots) slot.job?.reject(error);
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
    this.slots = [];
  }
}
