import { Worker } from "node:worker_threads";
import { stat } from "node:fs/promises";
import { ByteCache } from "./cache.js";

type DecodedRaw = {
  data: Buffer;
  width: number;
  height: number;
  metadata: Record<string, string>;
};
const cache = new ByteCache<DecodedRaw>(128 * 1024 * 1024);
const pending = new Map<string, Promise<DecodedRaw>>();
export async function decodeRaw(file: string): Promise<DecodedRaw> {
  const s = await stat(file);
  const key = `${file}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = new Promise<DecodedRaw>((resolve, reject) => {
    const worker = new Worker(
      new URL("../imaging/raw-decoder.mjs", import.meta.url),
      {
        workerData: file,
        execArgv: [],
      },
    );
    const timer = setTimeout(() => {
      reject(new Error("RAW decoding timed out after 120 seconds"));
      void worker.terminate();
    }, 120_000);
    worker.once("message", (result: DecodedRaw & { error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error(result.error));
      else resolve({ ...result, data: Buffer.from(result.data) });
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("RAW decoder exited before returning an image"));
    });
  });
  pending.set(key, work);
  try {
    const decoded = await work;
    cache.set(key, decoded, decoded.data.byteLength);
    return decoded;
  } finally {
    pending.delete(key);
  }
}
