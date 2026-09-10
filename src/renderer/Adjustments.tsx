import { useRef } from "react";
import { Slider } from "@base-ui/react/slider";
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  RefreshCcw,
} from "lucide-react";
import { adjustmentControls, type Photo, type Recipe } from "../shared/model";
import { Btn } from "./ui";
export function Adjustments({
  photo,
  recipe,
  onDraft,
  onCommit,
  onAction,
  copied,
  busy,
}: {
  photo?: Photo;
  recipe?: Recipe;
  onDraft: (r: Recipe | null) => void;
  onCommit: (patch: Partial<Recipe>, revision?: number) => void;
  onAction: (name: string) => void;
  copied: boolean;
  busy: boolean;
}) {
  const gesture = useRef<{ revision: number; recipe: Recipe } | null>(null);
  function change(key: keyof Recipe, value: number) {
    if (!photo || !recipe) return;
    if (!gesture.current)
      gesture.current = { revision: photo.revision, recipe: { ...recipe } };
    gesture.current.recipe = { ...gesture.current.recipe, [key]: value };
    onDraft(gesture.current.recipe);
  }
  function commit(key: keyof Recipe, value: number) {
    if (!photo) return;
    const revision = gesture.current?.revision ?? photo.revision;
    gesture.current = null;
    onCommit({ [key]: value }, revision);
  }
  return (
    <aside className="adjustments panel">
      <div className="panel-title">
        <h2>Adjustments</h2>
        <span className="muted">
          {photo ? `Rev ${photo.revision}` : "No photo"}
        </span>
      </div>
      <div className="tool-row">
        <Btn
          title="Undo (⌘Z)"
          aria-label="Undo"
          disabled={!photo?.history.length || busy}
          onClick={() => onAction("undo")}
        >
          <Undo2 size={16} />
        </Btn>
        <Btn
          title="Redo (⇧⌘Z)"
          aria-label="Redo"
          disabled={!photo?.future.length || busy}
          onClick={() => onAction("redo")}
        >
          <Redo2 size={16} />
        </Btn>
        <span className="spacer" />
        <Btn
          title="Reset edits"
          aria-label="Reset edits"
          disabled={!photo || busy}
          onClick={() => onAction("reset_edits")}
        >
          <RefreshCcw size={15} />
        </Btn>
      </div>
      <div className="adjustments-scroll">
        {!photo && (
          <p className="muted panel-help">
            Select a photo to adjust light, color, and composition.
          </p>
        )}
        <fieldset disabled={!photo || busy}>
          <details open>
            <summary>Composition</summary>
            <div className="tool-row">
              <Btn
                aria-label="Rotate left"
                title="Rotate left"
                onClick={() =>
                  onCommit({ rotation: ((recipe?.rotation ?? 0) + 3) % 4 })
                }
              >
                <RotateCcw size={16} />
              </Btn>
              <Btn
                aria-label="Rotate right"
                title="Rotate right"
                onClick={() =>
                  onCommit({ rotation: ((recipe?.rotation ?? 0) + 1) % 4 })
                }
              >
                <RotateCw size={16} />
              </Btn>
              <Btn
                aria-label="Flip horizontal"
                title="Flip horizontal"
                onClick={() => onCommit({ flipX: !recipe?.flipX })}
              >
                <FlipHorizontal2 size={16} />
              </Btn>
              <Btn
                aria-label="Flip vertical"
                title="Flip vertical"
                onClick={() => onCommit({ flipY: !recipe?.flipY })}
              >
                <FlipVertical2 size={16} />
              </Btn>
            </div>
            <label className="number-row">
              Straighten{" "}
              <input
                aria-label="Straighten"
                type="number"
                min={-45}
                max={45}
                step={0.1}
                value={recipe?.straighten ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= -45 && v <= 45) onCommit({ straighten: v });
                }}
              />
              <span>°</span>
            </label>
            <Btn
              className="wide"
              disabled={!recipe?.crop}
              onClick={() => onCommit({ crop: null })}
            >
              Reset crop
            </Btn>
          </details>
          {["Light", "Color", "Detail"].map((group) => (
            <details open={group !== "Detail"} key={group}>
              <summary>{group}</summary>
              {adjustmentControls
                .filter((c) => c[5] === group)
                .map(([key, label, min, max, step]) => (
                  <Slider.Root
                    key={key}
                    className="adjustment"
                    disabled={!photo || busy}
                    min={min}
                    max={max}
                    step={step}
                    value={recipe?.[key] ?? 0}
                    onValueChange={(value) => change(key, Number(value))}
                    onValueCommitted={(value) => commit(key, Number(value))}
                  >
                    <div className="slider-label">
                      <Slider.Label>{label}</Slider.Label>
                      <button
                        className="value-reset"
                        title={`Reset ${label}`}
                        onClick={() => onCommit({ [key]: 0 })}
                        disabled={!photo || busy}
                      >
                        {(recipe?.[key] ?? 0) > 0 ? "+" : ""}
                        {key === "exposure"
                          ? (recipe?.[key] ?? 0).toFixed(2)
                          : (recipe?.[key] ?? 0)}
                      </button>
                    </div>
                    <Slider.Control className="slider-control">
                      <Slider.Track className="slider-track">
                        <Slider.Indicator className="slider-indicator" />
                        <Slider.Thumb
                          className="slider-thumb"
                          aria-label={label}
                        />
                      </Slider.Track>
                    </Slider.Control>
                  </Slider.Root>
                ))}
            </details>
          ))}
        </fieldset>
        {photo && (
          <details>
            <summary>File information</summary>
            <dl className="metadata">
              <dt>Name</dt>
              <dd>{photo.name}</dd>
              <dt>Dimensions</dt>
              <dd>
                {photo.width} × {photo.height}
              </dd>
              <dt>Format</dt>
              <dd>{photo.format.toUpperCase()}</dd>
              <dt>Size</dt>
              <dd>{(photo.size / 1024 / 1024).toFixed(1)} MB</dd>
              <dt>Folder</dt>
              <dd>{photo.folder}</dd>
              {Object.entries(photo.metadata ?? {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <Btn className="wide" onClick={() => onAction("relink")}>
              Relink original file
            </Btn>
          </details>
        )}
      </div>
      <div className="adjustments-footer">
        <Btn disabled={!photo} onClick={() => onAction("copy")}>
          <Copy size={14} />
          Copy
        </Btn>
        <Btn
          disabled={!photo || !copied || busy}
          onClick={() => onAction("paste")}
        >
          <ClipboardPaste size={14} />
          Paste
        </Btn>
        <Btn
          className="wide"
          disabled={!photo || busy}
          onClick={() => onAction("sync")}
        >
          Apply to selected photos
        </Btn>
      </div>
    </aside>
  );
}
