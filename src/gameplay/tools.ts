import { PerspectiveCamera, Vector3 } from "three";
import type { Body, Vec3 } from "../world/types";
import { makePlanetBase, makeAtmosPreset } from "../world/procedural";
import type { ToolState } from "../app/state/store";
import { V3 } from "../utils/math";

export function spawnPlanetAtCursor(pos: Vector3, p: ToolState["planetCreate"]): Body {
  return makePlanetBase({
    name: `Planet-${Math.floor(Math.random() * 999)}`,
    kind: "Planet",
    radius: p.radius,
    mass: p.mass,
    position: [pos.x, pos.y, pos.z],
    rotation: { spin: p.spin, tiltDeg: p.tiltDeg, phase: 0 },
    atmosphere: makeAtmosPreset("Earth-like", p.atmosphereDensity),
    ocean: { seaLevel: p.seaLevel, freeze: 0 },
  });
}

export function spawnBlackholeAtCursor(pos: Vector3, bh: ToolState["blackhole"]): Body {
  return makePlanetBase({
    name: "Black Hole",
    kind: "BlackHole",
    radius: bh.horizonRadius,
    mass: bh.mass,
    position: [pos.x, pos.y, pos.z],
    blackhole: { horizonRadius: bh.horizonRadius, absorbRadius: bh.absorbRadius, lensStrength: bh.lensStrength },
  });
}

export function spawnAsteroidsBrush(camera: PerspectiveCamera, tools: ToolState, dt: number): Body[] {
  const rate = tools.asteroid.rate;
  const n = Math.floor(rate * dt);
  if (n <= 0) return [];

  const dir = new Vector3();
  camera.getWorldDirection(dir);

  const origin = camera.position.clone().add(dir.clone().multiplyScalar(2.5));
  const out: Body[] = [];

  for (let i = 0; i < n; i++) {
    const spread = 0.15;
    const jitter = new Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);

    const v = dir.clone().add(jitter).normalize().multiplyScalar(tools.asteroid.speed);
    const mass = tools.asteroid.mass;
    const r = Math.max(0.03, Math.cbrt(mass) * 0.15);

    const matSeed = Math.random() * 1000;

    const b = makePlanetBase({
      name: `Ast-${Math.floor(Math.random() * 9999)}`,
      kind: "Asteroid",
      radius: r,
      mass,
      position: [origin.x, origin.y, origin.z],
      velocity: [v.x, v.y, v.z],
      atmosphere: undefined,
      ocean: { seaLevel: 0, freeze: 0 },
      materialSeed: matSeed,
      trail: { enabled: false, seconds: 0 },
      tags: [tools.asteroid.material],
    });

    out.push(b);
  }
  return out;
}
