import type { Body, Vec3 } from "../world/types";
import { V3 } from "../utils/math";

const DEG = Math.PI / 180;

function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rotX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function rotZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function keplerSolve(M: number, e: number) {
  // Newton-Raphson on E
  let E = M;
  for (let i = 0; i < 6; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E = E - f / Math.max(1e-6, fp);
  }
  return E;
}

export function updateKeplerOrbits(bodies: Body[], t: number, distanceScale: number, mode: "Realistic" | "Chaos") {
  if (mode !== "Realistic") return bodies;

  const byId = new Map(bodies.map((b) => [b.id, b]));

  return bodies.map((b) => {
    if (!b.orbit) return b;
    const parent = byId.get(b.orbit.parentId);
    if (!parent) return b;

    const n = (2 * Math.PI) / Math.max(1e-6, b.orbit.period);
    const M = (b.orbit.meanAnomalyAtEpochDeg * DEG + n * t) % (2 * Math.PI);
    const e = b.orbit.eccentricity;
    const a = b.orbit.semiMajorAxis * distanceScale;

    const E = keplerSolve(M, e);
    const cosE = Math.cos(E), sinE = Math.sin(E);
    const r = a * (1 - e * cosE);
    const trueAnom = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);

    // orbital plane position
    let pos: Vec3 = [r * Math.cos(trueAnom), 0, r * Math.sin(trueAnom)];

    // rotate by orbital elements
    pos = rotZ(pos, b.orbit.argumentPeriapsisDeg * DEG);
    pos = rotX(pos, b.orbit.inclinationDeg * DEG);
    pos = rotZ(pos, b.orbit.longitudeAscendingNodeDeg * DEG);

    const worldPos = V3.add(parent.position, pos);

    return {
      ...b,
      position: worldPos,
      velocity: b.velocity, // keep for chaos interactions; orbit controls position
    };
  });
}
