import type { Body, Vec3 } from "../world/types";
import { V3 } from "../utils/math";

export type GravityConfig = {
  G: number;
  topK: 1 | 2;
};

function accelFrom(source: Body, targetPos: Vec3, G: number): Vec3 {
  const r = V3.sub(source.position, targetPos);
  const d2 = Math.max(1e-6, V3.dot(r, r));
  const d = Math.sqrt(d2);
  const a = (G * source.mass) / d2;
  return V3.mul(r, a / d);
}

export function computeTopKInfluencers(bodies: Body[], target: Body, k: 1 | 2): Body[] {
  const candidates = bodies.filter(
    (b) =>
      b.id !== target.id &&
      b.visible &&
      (b.kind === "Star" || b.kind === "Planet" || b.kind === "Moon" || b.kind === "BlackHole")
  );

  // score by mass / distance^2
  const scored = candidates
    .map((b) => {
      const dx = b.position[0] - target.position[0];
      const dy = b.position[1] - target.position[1];
      const dz = b.position[2] - target.position[2];
      const d2 = Math.max(1e-6, dx * dx + dy * dy + dz * dz);
      const score = b.mass / d2;
      return { b, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.b);

  return scored;
}

export function applyGravityStep(bodies: Body[], dt: number, cfg: GravityConfig) {
  const out = bodies.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (!b.visible) continue;
    if (b.kind === "Star") continue; // keep sun static for stability
    if (b.orbit && b.kind !== "Asteroid" && b.kind !== "Debris") continue; // orbit-controlled bodies
    if (b.kind === "BlackHole") continue;

    const influencers = computeTopKInfluencers(out, b, cfg.topK);
    let a: Vec3 = [0, 0, 0];
    for (const s of influencers) a = V3.add(a, accelFrom(s, b.position, cfg.G));
    b.velocity = V3.add(b.velocity, V3.mul(a, dt));
  }
  return out;
}
