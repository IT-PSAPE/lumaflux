import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Maximize,
  ZoomIn,
  ZoomOut,
  Columns2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Photo, Recipe } from "../shared/model";
import { neutralRecipe } from "../shared/model";
import { Btn } from "./ui";
import { fullCrop, resizeCrop, type CropBox } from "./crop";
export function Viewer({
  photo,
  recipe,
  preview,
  onCrop,
  onError,
  composition,
  aspect,
  locked,
  previous,
  next,
  canPrevious,
  canNext,
}: {
  photo: Photo;
  recipe: Recipe;
  preview: (id: string, recipe: Recipe, max?: number) => Promise<string>;
  onCrop: (crop: Recipe["crop"]) => void;
  onError: (message: string) => void;
  composition: boolean;
  aspect: string;
  locked: boolean;
  previous: () => void;
  next: () => void;
  canPrevious: boolean;
  canNext: boolean;
}) {
  const [src, setSrc] = useState(""),
    [original, setOriginal] = useState(""),
    [compare, setCompare] = useState(false),
    [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [full, setFull] = useState(false);
  const [crop, setCrop] = useState<CropBox>(recipe.crop ?? fullCrop);
  const img = useRef<HTMLImageElement>(null),
    serial = useRef(0),
    pixelFit = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    rect: DOMRect;
    box: CropBox;
    handle: string;
    ratio: number;
    pan: typeof pan;
  } | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const lastAspect = useRef(aspect);
  useEffect(() => {
    setCrop(recipe.crop ?? fullCrop);
  }, [photo.id, JSON.stringify(recipe.crop)]);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCompare(false);
    setFull(false);
    setOriginal("");
  }, [photo.id, composition]);
  useEffect(() => {
    if (lastAspect.current === aspect) return;
    lastAspect.current = aspect;
    if (!composition || aspect === "free" || !img.current) return;
    const ratio =
      aspect === "original"
        ? 1
        : (Number(aspect) * img.current.naturalHeight) /
          img.current.naturalWidth;
    const width = Math.min(1, ratio),
      height = Math.min(1, 1 / ratio);
    const box = { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
    setCrop(box);
    onCrop(box);
  }, [aspect, composition]);
  useEffect(() => {
    let alive = true;
    const id = ++serial.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Sequential requests respect the shared renderer's latest-preview queue.
        const before = compare
          ? await preview(photo.id, neutralRecipe(), 2000)
          : "";
        if (!alive) return;
        const after = await preview(
          photo.id,
          composition && !compare ? { ...recipe, crop: null } : recipe,
          full ? 20000 : 2000,
        );
        if (alive && serial.current === id) {
          setOriginal(before);
          setSrc(after);
        }
      } catch (e) {
        if (alive && !String(e).includes("SUPERSEDED")) onError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }, 75);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [
    photo.id,
    photo.revision,
    JSON.stringify(recipe),
    compare,
    composition,
    full,
  ]);
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !img.current) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-handle]",
    )?.dataset.handle;
    if (composition && !compare && !handle) return;
    const box = cropRef.current;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      rect: img.current.getBoundingClientRect(),
      box,
      handle: handle ?? "pan",
      ratio: locked ? box.width / box.height : 0,
      pan,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.handle === "pan")
      setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y });
    else {
      const box = resizeCrop(
        d.box,
        d.handle,
        (e.clientX - d.x) / d.rect.width,
        (e.clientY - d.y) / d.rect.height,
        d.ratio,
      );
      cropRef.current = box;
      setCrop(box);
    }
  }
  function fit() {
    pixelFit.current = false;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  return (
    <div className="viewer">
      <div className="viewer-tools">
        <div className="viewer-file">
          <strong>{photo.name}</strong>
          <span className="muted">
            {photo.width} × {photo.height}
          </span>
        </div>
        <Btn
          aria-label="Previous photo"
          disabled={!canPrevious}
          onClick={previous}
        >
          <ChevronLeft size={14} />
        </Btn>
        <Btn aria-label="Next photo" disabled={!canNext} onClick={next}>
          <ChevronRight size={14} />
        </Btn>
        <span className="spacer" />
        <Btn
          aria-pressed={compare}
          className={compare ? "active" : ""}
          onClick={() => {
            setCompare(!compare);
            fit();
          }}
        >
          <Columns2 size={14} />
          Compare
        </Btn>
        <Btn
          aria-label="Zoom out"
          disabled={composition || compare}
          onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
        >
          <ZoomOut size={14} />
        </Btn>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <Btn
          aria-label="Zoom in"
          disabled={composition || compare}
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
        >
          <ZoomIn size={14} />
        </Btn>
        <Btn
          disabled={composition || compare}
          onClick={() => {
            pixelFit.current = true;
            setFull(true);
            if (img.current) {
              setZoom(
                img.current.naturalWidth /
                  (img.current.getBoundingClientRect().width / zoom),
              );
              if (full) pixelFit.current = false;
            }
          }}
        >
          1:1
        </Btn>
        <Btn onClick={fit}>
          <Maximize size={14} />
          Fit
        </Btn>
      </div>
      <div
        className={`canvas ${composition && !compare ? "cropping" : ""} ${compare ? "comparing" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => {
          if (
            drag.current &&
            drag.current.handle !== "pan" &&
            JSON.stringify(drag.current.box) !== JSON.stringify(cropRef.current)
          )
            onCrop(cropRef.current);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          setCrop(recipe.crop ?? fullCrop);
        }}
        onWheel={(e) => {
          if (!composition && !compare)
            setZoom((z) =>
              Math.max(0.25, Math.min(8, z * (e.deltaY > 0 ? 0.9 : 1.1))),
            );
        }}
      >
        {compare && original && (
          <figure className="compare-pane">
            <figcaption>Original</figcaption>
            <img
              src={original}
              alt={`Original ${photo.name}`}
              draggable={false}
            />
          </figure>
        )}
        {src ? (
          <div
            className={compare ? "compare-pane" : "image-wrap"}
            style={
              compare
                ? undefined
                : {
                    transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                  }
            }
          >
            {compare && <div className="compare-label">Edited</div>}
            <img
              ref={img}
              src={src}
              alt={compare ? `Edited ${photo.name}` : photo.name}
              draggable={false}
              onLoad={(e) => {
                if (pixelFit.current) {
                  setZoom(
                    e.currentTarget.naturalWidth /
                      (e.currentTarget.getBoundingClientRect().width / zoom),
                  );
                  setPan({ x: 0, y: 0 });
                  pixelFit.current = false;
                }
              }}
            />
            {composition && !compare && (
              <div
                className="crop-rectangle"
                data-handle="move"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
              >
                <i />
                <i />
                {["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((h) => (
                  <button
                    key={h}
                    data-handle={h}
                    className={`crop-handle handle-${h}`}
                    aria-label={`Resize crop ${h}`}
                    onKeyDown={(e) => {
                      const delta = e.shiftKey ? 0.02 : 0.005;
                      const dx =
                        e.key === "ArrowLeft"
                          ? -delta
                          : e.key === "ArrowRight"
                            ? delta
                            : 0;
                      const dy =
                        e.key === "ArrowUp"
                          ? -delta
                          : e.key === "ArrowDown"
                            ? delta
                            : 0;
                      if (dx || dy) {
                        e.preventDefault();
                        onCrop(
                          resizeCrop(
                            crop,
                            h,
                            dx,
                            dy,
                            locked ? crop.width / crop.height : 0,
                          ),
                        );
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="muted">
            {photo.missing
              ? "Original file is missing. Relink it to continue."
              : "Loading photo…"}
          </p>
        )}
        {loading && <span className="canvas-status">Rendering…</span>}
      </div>
    </div>
  );
}
