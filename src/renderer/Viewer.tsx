import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Crop,
  Maximize,
  ZoomIn,
  ZoomOut,
  Columns2,
  Check,
  X,
} from "lucide-react";
import type { Photo, Recipe } from "../shared/model";
import { neutralRecipe } from "../shared/model";
import { Btn } from "./ui";
export function Viewer({
  photo,
  recipe,
  preview,
  onCrop,
  onError,
}: {
  photo: Photo;
  recipe: Recipe;
  preview: (id: string, recipe: Recipe, max?: number) => Promise<string>;
  onCrop: (crop: Recipe["crop"]) => void;
  onError: (message: string) => void;
}) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Recipe["crop"]>(null);
  const [aspect, setAspect] = useState("free");
  const [fullResolution, setFullResolution] = useState(false);
  const [pixelFit, setPixelFit] = useState(false);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const sequence = useRef(0);
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    rect: DOMRect;
  } | null>(null);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCropMode(false);
    setCrop(null);
    setSrc("");
    setFullResolution(false);
    setPixelFit(false);
  }, [photo.id]);
  useEffect(() => {
    let alive = true;
    const serial = ++sequence.current;
    setLoading(true);
    const timer = setTimeout(() => {
      const current = compare
        ? neutralRecipe()
        : cropMode
          ? { ...recipe, crop: null }
          : recipe;
      preview(photo.id, current, fullResolution ? 20000 : 2000)
        .then((result) => {
          if (alive && serial === sequence.current) setSrc(result);
        })
        .catch((e) => {
          if (alive && !String(e).includes("SUPERSEDED")) onError(String(e));
        })
        .finally(() => {
          if (alive && serial === sequence.current) setLoading(false);
        });
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
    cropMode,
    fullResolution,
  ]);
  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !img.current) return;
    const rect = img.current.getBoundingClientRect();
    if (
      cropMode &&
      (e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom)
    )
      return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
      rect,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (cropMode) setCrop(null);
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (!cropMode) {
      setPan({ x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y });
      return;
    }
    const x0 = Math.max(0, Math.min(1, (d.x - d.rect.left) / d.rect.width));
    const y0 = Math.max(0, Math.min(1, (d.y - d.rect.top) / d.rect.height));
    const x1 = Math.max(
      0,
      Math.min(1, (e.clientX - d.rect.left) / d.rect.width),
    );
    const y1 = Math.max(
      0,
      Math.min(1, (e.clientY - d.rect.top) / d.rect.height),
    );
    let w = Math.abs(x1 - x0),
      h = Math.abs(y1 - y0);
    const ratio =
      aspect === "free"
        ? 0
        : aspect === "original"
          ? natural.width / natural.height
          : Number(aspect);
    if (ratio) {
      h = (w * d.rect.width) / (ratio * d.rect.height);
      const maxH = y1 >= y0 ? 1 - y0 : y0;
      if (h > maxH) {
        h = maxH;
        w = (h * ratio * d.rect.height) / d.rect.width;
      }
    }
    const x = x1 >= x0 ? x0 : x0 - w;
    const y = y1 >= y0 ? y0 : y0 - h;
    if (w > 0.001 && h > 0.001) setCrop({ x, y, width: w, height: h });
  }
  const actual = () => {
    setFullResolution(true);
    setPixelFit(true);
    if (img.current) {
      const rect = img.current.getBoundingClientRect();
      setZoom(img.current.naturalWidth / (rect.width / zoom));
      setPan({ x: 0, y: 0 });
      if (fullResolution) setPixelFit(false);
    }
  };
  return (
    <div className="viewer">
      <div className="viewer-tools">
        <Btn
          className={cropMode ? "active" : ""}
          onClick={() => {
            setCropMode(!cropMode);
            setCompare(false);
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setCrop(null);
          }}
        >
          <Crop size={16} />
          Crop
        </Btn>
        {cropMode ? (
          <>
            <select
              aria-label="Crop aspect ratio"
              value={aspect}
              onChange={(e) => {
                setAspect(e.target.value);
                setCrop(null);
              }}
            >
              <option value="free">Free ratio</option>
              <option value="original">Original</option>
              <option value="1">1:1</option>
              <option value="1.5">3:2</option>
              <option value="1.333333333">4:3</option>
              <option value="1.777777778">16:9</option>
              <option value="0.8">4:5</option>
            </select>
            <Btn
              disabled={!crop}
              onClick={() => {
                onCrop(crop);
                setCropMode(false);
              }}
            >
              <Check size={15} />
              Apply crop
            </Btn>
            <Btn aria-label="Cancel crop" onClick={() => setCropMode(false)}>
              <X size={15} />
            </Btn>
          </>
        ) : (
          <>
            <Btn
              className={compare ? "active" : ""}
              onClick={() => setCompare(!compare)}
            >
              <Columns2 size={16} />
              {compare ? "Original" : "Compare"}
            </Btn>
            <span className="spacer" />
            <Btn
              aria-label="Zoom out"
              onClick={() => setZoom((v) => Math.max(0.25, v / 1.25))}
            >
              <ZoomOut size={16} />
            </Btn>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <Btn
              aria-label="Zoom in"
              onClick={() => setZoom((v) => Math.min(8, v * 1.25))}
            >
              <ZoomIn size={16} />
            </Btn>
            <Btn onClick={actual}>1:1</Btn>
            <Btn
              onClick={() => {
                setPixelFit(false);
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <Maximize size={15} />
              Fit
            </Btn>
          </>
        )}
      </div>
      <div
        className={`canvas ${cropMode ? "cropping" : ""}`}
        ref={stage}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          if (!cropMode)
            setZoom((z) =>
              Math.max(0.25, Math.min(8, z * (e.deltaY > 0 ? 0.9 : 1.1))),
            );
        }}
      >
        {src ? (
          <div
            className="image-wrap"
            style={{
              transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            }}
          >
            <img
              ref={img}
              src={src}
              draggable={false}
              alt={photo.name}
              onLoad={(e) => {
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
                if (pixelFit) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setZoom(e.currentTarget.naturalWidth / (rect.width / zoom));
                  setPan({ x: 0, y: 0 });
                  setPixelFit(false);
                }
              }}
            />
            {cropMode && crop && (
              <div
                className="crop-rectangle"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
              >
                <i />
                <i />
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
        {compare && <span className="original-label">Original</span>}
        {cropMode && (
          <span className="canvas-hint">
            Drag across the image to choose a crop
          </span>
        )}
      </div>
      <div className="viewer-caption">
        <span>{photo.name}</span>
        <span>
          {photo.width} × {photo.height} · {photo.format.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
