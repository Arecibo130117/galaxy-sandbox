import React, { useMemo } from "react";
import { useStore } from "../state/store";

type Orbit = { a: number; e: number };
type Vec3Like = { x: number; y: number; z: number };
type BodyLike = {
  id: string;
  name?: string;
  type?: string;
  enabled?: boolean;
  orbit?: Partial<Orbit> | undefined;
  position?: Partial<Vec3Like> | undefined;
  minimap?: { x?: number; y?: number } | undefined;
  color?: string;
};

function num(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function safe01(x: number) {
  return Math.min(1, Math.max(0, x));
}
function safeLen2(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}
function safeDot(v: number) {
  return Number.isFinite(v) ? v : 0;
}

function ellipseRadiiFromOrbit(aNorm: number, eRaw: number) {
  const a = Math.max(1e-9, num(aNorm, 0));
  const e = safe01(Math.abs(num(eRaw, 0)));
  const ry = a * Math.sqrt(Math.max(1e-9, 1.0 - e * e));
  return { rx: a, ry };
}

export function Minimap() {
  const bodies: BodyLike[] = useStore((s: any) => s.bodies ?? s.world?.bodies ?? []);
  const focusId: string | null = useStore((s: any) => s.camera?.focusId ?? null);

  // distanceScale이 undefined/0이면 NaN/Inf가 터지므로 기본값 1 + 최소값 클램프
  const distanceScaleRaw = useStore((s: any) => s.scales?.distance ?? s.distanceScale ?? 1);
  const distanceScale = Math.max(1e-6, num(distanceScaleRaw, 1));

  const prepared = useMemo(() => {
    const enabledBodies = (bodies ?? []).filter((b) => b && (b.enabled ?? true));

    // maxA 계산 (orbit.a 우선)
    let maxA = 0.001;
    for (const b of enabledBodies) {
      const a = num(b.orbit?.a, 0);
      if (a > maxA) maxA = a;
    }

    // fallback: position 기반
    if (maxA <= 0.001) {
      for (const b of enabledBodies) {
        const px = num(b.position?.x, NaN);
        const pz = num(b.position?.z, NaN);
        if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
        const r = Math.sqrt(px * px + pz * pz);
        if (Number.isFinite(r) && r > maxA) maxA = r;
      }
    }

    // denom 안전화
    const denom = Math.max(1e-6, maxA * distanceScale);

    return enabledBodies.map((b) => {
      const hasOrbit = !!b.orbit && Number.isFinite(num(b.orbit?.a, NaN));
      const a = num(b.orbit?.a, 0);
      const e = num(b.orbit?.e, 0);

      const aNorm = a / denom;
      const { rx, ry } = hasOrbit ? ellipseRadiiFromOrbit(aNorm, e) : { rx: 0, ry: 0 };

      // dot position
      let x = 0;
      let y = 0;

      const mx = num(b.minimap?.x, NaN);
      const my = num(b.minimap?.y, NaN);
      if (Number.isFinite(mx) && Number.isFinite(my)) {
        x = mx;
        y = my;
      } else {
        const px = num(b.position?.x, NaN);
        const pz = num(b.position?.z, NaN);
        if (Number.isFinite(px) && Number.isFinite(pz)) {
          x = (px / denom) * 0.95;
          y = (pz / denom) * 0.95;
        } else if (hasOrbit) {
          x = aNorm * 0.95;
          y = 0;
        } else {
          x = 0;
          y = 0;
        }
      }

      // clamp inside view, NaN 방지
      x = safeDot(x);
      y = safeDot(y);

      const L = safeLen2(x, y);
      if (L > 0.98) {
        const k = 0.98 / L;
        x *= k;
        y *= k;
      }

      return {
        ...b,
        hasOrbit,
        rx: safeDot(rx),
        ry: safeDot(ry),
        dotX: safeDot(x),
        dotY: safeDot(y),
      };
    });
  }, [bodies, distanceScale]);

  return (
    <div className="w-full h-full rounded-lg border border-white/10 bg-black/30">
      <svg viewBox="-1 -1 2 2" className="w-full h-full">
        {/* Sun */}
        <circle cx={0} cy={0} r={0.03} fill="rgba(255,220,140,0.95)" />
        <circle cx={0} cy={0} r={0.06} fill="none" stroke="rgba(255,220,140,0.25)" strokeWidth={0.01} />

        {/* Orbits */}
        {prepared.map((b) => {
          if (!b.hasOrbit) return null;
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

        {/* Dots */}
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

          // 최종 안전장치: cx/cy는 반드시 finite number
          const cx = safeDot((b as any).dotX);
          const cy = safeDot((b as any).dotY);

          return <circle key={`dot-${b.id}`} cx={cx} cy={cy} r={r} fill={fill} />;
        })}
      </svg>
    </div>
  );
}

export default Minimap;
