import React, { useMemo } from "react";
import { useStore } from "../state/store";

/**
 * Minimap (Sun-centered orbit overview)
 * - Orbit rings: only render when body.orbit exists
 * - Dots: use body.minimap if exists; else project body.position onto XZ
 *
 * Defensive typing to avoid strict TS issues in UI.
 */

type Orbit = {
  a: number;
  e: number;
};

type Vec3Like = { x: number; y: number; z: number };

type BodyLike = {
  id: string;
  name?: string;
  type?: string;
  enabled?: boolean;

  orbit?: Orbit;

  position?: Vec3Like; // world (floating-origin) position
  minimap?: { x: number; y: number }; // optional precomputed minimap coord
  color?: string;
};

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function ellipseRadiiFromOrbit(a: number, e: number) {
  const rx = Math.max(1e-9, a);
  const ee = clamp01(Math.abs(e));
  const ry = rx * Math.sqrt(Math.max(1e-9, 1.0 - ee * ee));
  return { rx, ry };
}

export function Minimap() {
  const bodies: BodyLike[] = useStore((s: any) => s.bodies ?? s.world?.bodies ?? []);
  const focusId: string | null = useStore((s: any) => s.camera?.focusId ?? null);

  // Optional: distance scale
  const distanceScale: number = useStore((s: any) => s.scales?.distance ?? s.distanceScale ?? 1);

  const prepared = useMemo(() => {
    const enabledBodies = (bodies ?? []).filter((b) => b && (b.enabled ?? true));

    // Determine normalizing radius (max orbit a, fallback to position radius)
    let maxA = 0.001;
    for (const b of enabledBodies) {
      const a = b.orbit?.a ?? 0;
      if (a > maxA) maxA = a;
    }
    if (maxA <= 0.001) {
      for (const b of enabledBodies) {
        const p = b.position;
        if (!p) continue;
        const r = Math.sqrt(p.x * p.x + p.z * p.z);
        if (r > maxA) maxA = r;
      }
    }

    const denom = Math.max(1e-6, maxA * Math.max(1e-6, distanceScale));

    return enabledBodies.map((b) => {
      const hasOrbit = !!b.orbit;
      const a = b.orbit?.a ?? 0;
      const e = b.orbit?.e ?? 0;

      const { rx, ry } = hasOrbit ? ellipseRadiiFromOrbit(a / denom, e) : { rx: 0, ry: 0 };

      // dot pos
      let x = 0;
      let y = 0;

      if (b.minimap) {
        x = b.minimap.x;
        y = b.minimap.y;
      } else if (b.position) {
        x = (b.position.x / denom) * 0.95;
        y = (b.position.z / denom) * 0.95;
      } else if (hasOrbit) {
        x = (a / denom) * 0.95;
        y = 0;
      }

      // clamp
      const L = Math.sqrt(x * x + y * y);
      if (L > 0.98) {
        const k = 0.98 / L;
        x *= k;
        y *= k;
      }

      return {
        ...b,
        hasOrbit,
        rx,
        ry,
        dotX: x,
        dotY: y,
      };
    });
  }, [bodies, distanceScale]);

  return (
    <div className="w-full h-full rounded-lg border border-white/10 bg-black/30">
      <svg viewBox="-1 -1 2 2" className="w-full h-full">
        {/* Sun center */}
        <circle cx={0} cy={0} r={0.03} fill="rgba(255,220,140,0.95)" />
        <circle cx={0} cy={0} r={0.06} fill="none" stroke="rgba(255,220,140,0.25)" strokeWidth={0.01} />

        {/* Orbit rings */}
        {prepared.map((b) => {
          if (!b.hasOrbit) return null; // ✅ orbit 없는 경우 스킵 (TS18048 해결)

          return (
            <ellipse
              key={`orbit-${b.id}`}
              cx={0}
              cy={0}
              rx={b.rx}
              ry={b.ry}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={0.004}
            />
          );
        })}

        {/* Body dots */}
        {prepared.map((b) => {
          const isFocus = b.id === focusId;
          const r = isFocus ? 0.022 : 0.014;

          const fill =
            b.color ??
            (b.type === "sun"
              ? "rgba(255,220,140,0.95)"
              : isFocus
              ? "rgba(255,220,120,0.95)"
              : "rgba(220,230,255,0.85)");

          return <circle key={`dot-${b.id}`} cx={b.dotX} cy={b.dotY} r={r} fill={fill} />;
        })}
      </svg>
    </div>
  );
}

export default Minimap;
