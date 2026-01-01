import React, { useEffect, useMemo, useRef } from "react";
import { useStore } from "../state/store";
import { length2 } from "../../utils/math";

export function Minimap() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const bodies = useStore((s) => s.bodies);
  const tools = useStore((s) => s.tools);
  const selectedId = useStore((s) => s.selectedId);

  const sun = useMemo(() => bodies.find((b) => b.kind === "Star" && b.name === "Sun"), [bodies]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const w = c.width, h = c.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);

    const center = { x: w / 2, y: h / 2 };
    const scale = 0.08 / Math.max(1e-3, tools.distanceScale);

    // orbits
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;

    for (const b of bodies) {
      if (!b.visible) continue;
      if (b.orbit?.parentId !== sun?.id) continue;
      const r = b.orbit.semiMajorAxis * tools.distanceScale * scale;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // points
    for (const b of bodies) {
      if (!b.visible) continue;
      const isSel = b.id === selectedId;
      const p = b.position;
      const x = center.x + p[0] * tools.distanceScale * scale;
      const y = center.y + p[2] * tools.distanceScale * scale;

      const r = Math.max(1.5, Math.min(4, (b.radius * tools.radiusScale) * 1.2));
      ctx.fillStyle = isSel ? "rgba(180,220,255,0.95)" : "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // bounds circle
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.min(w, h) * 0.48, 0, Math.PI * 2);
    ctx.stroke();

    // legend
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px sans-serif";
    ctx.fillText(`Scale: ${tools.distanceScale.toFixed(3)}`, 8, h - 10);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodies, tools.distanceScale, tools.radiusScale, selectedId, sun?.id]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur p-2">
      <div className="text-xs font-semibold text-white/80 mb-2">Mini-map (Orbit Layout)</div>
      <canvas ref={ref} width={260} height={260} className="w-full rounded-lg border border-white/10" />
      <div className="mt-2 text-[11px] text-white/60">
        Sun-centered top-down. Distances are scaled.
      </div>
    </div>
  );
}
