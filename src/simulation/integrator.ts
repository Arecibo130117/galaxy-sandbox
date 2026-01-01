import type { Body } from "../world/types";
import { V3 } from "../utils/math";

export function integrateBodies(bodies: Body[], dt: number) {
  return bodies.map((b) => {
    if (!b.visible) return b;
    if (b.kind === "Star") return b;
    if (b.orbit && b.kind !== "Asteroid" && b.kind !== "Debris") return b;
    if (b.kind === "BlackHole") return b;

    return { ...b, position: V3.add(b.position, V3.mul(b.velocity, dt)) };
  });
}
