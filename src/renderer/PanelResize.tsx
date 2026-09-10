import { useRef } from "react";
export function PanelResize({
  width,
  onChange,
  side,
}: {
  width: number;
  onChange: (width: number) => void;
  side: "left" | "right";
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-label={`Resize ${side} panel`}
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={480}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current)
          onChange(
            Math.max(
              180,
              Math.min(
                480,
                start.current.width +
                  (e.clientX - start.current.x) * (side === "left" ? 1 : -1),
              ),
            ),
          );
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(
            Math.max(
              180,
              Math.min(
                480,
                width +
                  (e.key === "ArrowRight" ? 10 : -10) *
                    (side === "left" ? 1 : -1),
              ),
            ),
          );
        }
      }}
    />
  );
}
