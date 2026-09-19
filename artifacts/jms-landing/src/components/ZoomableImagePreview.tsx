import { useCallback, useEffect, useRef, useState, type PointerEvent, type TouchEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { imagePreviewSrc } from "@/lib/attachmentPreview";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

type Props = {
  src: string;
  alt: string;
  fileName?: string;
  fileType?: string | null;
};

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export default function ZoomableImagePreview({ src, alt, fileName, fileType }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const applyScale = useCallback((nextScale: number, origin?: { x: number; y: number }) => {
    const prev = scaleRef.current;
    const next = clampZoom(nextScale);
    let nextOffset = offsetRef.current;
    if (next !== prev && origin && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const cx = origin.x - rect.left - rect.width / 2;
      const cy = origin.y - rect.top - rect.height / 2;
      const ratio = next / prev;
      nextOffset = {
        x: cx - (cx - nextOffset.x) * ratio,
        y: cy - (cy - nextOffset.y) * ratio,
      };
    }
    if (next <= 1) nextOffset = { x: 0, y: 0 };
    scaleRef.current = next;
    offsetRef.current = nextOffset;
    setScale(next);
    setOffset(nextOffset);
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetZoom();
  }, [src, resetZoom]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyScale(scaleRef.current + delta, { x: event.clientX, y: event.clientY });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyScale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyScale(scaleRef.current + ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyScale(scaleRef.current - ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyScale, resetZoom]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (scaleRef.current <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = {
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    };
    offsetRef.current = next;
    setOffset(next);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    pinchRef.current = {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      scale: scaleRef.current,
    };
    dragRef.current = null;
    setDragging(false);
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    applyScale(pinchRef.current.scale * (distance / pinchRef.current.distance), {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const percent = Math.round(scale * 100);
  const canZoomOut = scale > MIN_ZOOM + 0.001;
  const canZoomIn = scale < MAX_ZOOM - 0.001;
  const canReset = scale !== 1 || offset.x !== 0 || offset.y !== 0;
  const displaySrc = imagePreviewSrc(src, fileName || alt, fileType);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-[#525659]">
      <div
        ref={viewportRef}
        className={`absolute inset-0 touch-none ${dragging ? "cursor-grabbing" : scale > 1 ? "cursor-grab" : "cursor-zoom-in"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => (scale > 1 ? resetZoom() : applyScale(2))}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
        >
          <img
            src={displaySrc}
            alt={alt}
            draggable={false}
            decoding="async"
            fetchPriority="high"
            className="h-full w-full select-none object-contain"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end p-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-1 text-white shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={() => applyScale(scaleRef.current - ZOOM_STEP)}
            disabled={!canZoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums">{percent}%</span>
          <button
            type="button"
            onClick={() => applyScale(scaleRef.current + ZOOM_STEP)}
            disabled={!canZoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={!canReset}
            className="ml-0.5 rounded-full px-2.5 py-1 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
