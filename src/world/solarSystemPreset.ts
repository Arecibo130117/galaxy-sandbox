import type { Body } from "./types";
import { makeAtmosPreset, makePlanetBase } from "./procedural";

export function makeScaledSolarSystem(distanceScale: number, radiusScale: number, massScale: number, atmoPreset: "Earth-like" | "Thin Mars-like" | "Dense Venus-like") {
  // "보기 좋은" scaled values (not real)
  const sun = makePlanetBase({
    name: "Sun",
    kind: "Star",
    radius: 6.5,
    mass: 2000 * massScale,
    position: [0, 0, 0],
    rotation: { spin: 0.08, tiltDeg: 7, phase: 0 },
  });

  const mk = (name: string, a: number, r: number, m: number, period: number, extra?: Partial<Body>) =>
    makePlanetBase({
      name,
      kind: extra?.kind ?? "Planet",
      radius: r,
      mass: m * massScale,
      position: [a * distanceScale, 0, 0],
      orbit: {
        parentId: sun.id,
        semiMajorAxis: a,
        eccentricity: 0.02,
        inclinationDeg: 0.0,
        longitudeAscendingNodeDeg: 0,
        argumentPeriapsisDeg: 0,
        meanAnomalyAtEpochDeg: Math.random() * 360,
        period,
      },
      rotation: { spin: 0.25, tiltDeg: 15, phase: 0 },
      ...extra,
    });

  const mercury = mk("Mercury", 16, 0.55, 0.6, 30, { atmosphere: makeAtmosPreset("Thin Mars-like", 0.1), ocean: { seaLevel: 0.0, freeze: 0 } });
  const venus = mk("Venus", 22, 0.95, 0.9, 45, { atmosphere: makeAtmosPreset("Dense Venus-like", 2.2), ocean: { seaLevel: 0.0, freeze: 0 } });

  const earth = mk("Earth", 30, 1.02, 1.0, 60, { atmosphere: makeAtmosPreset("Earth-like", 1.0), ocean: { seaLevel: 0.02, freeze: 0 }, rotation: { spin: 0.45, tiltDeg: 23.4, phase: 0 } });
  const moon = makePlanetBase({
    name: "Moon",
    kind: "Moon",
    radius: 0.28,
    mass: 0.01 * massScale,
    position: [earth.position[0] + 2.0 * distanceScale, 0, earth.position[2]],
    orbit: {
      parentId: earth.id,
      semiMajorAxis: 2.0,
      eccentricity: 0.03,
      inclinationDeg: 5.0,
      longitudeAscendingNodeDeg: 0,
      argumentPeriapsisDeg: 0,
      meanAnomalyAtEpochDeg: 0,
      period: 10,
    },
    ocean: { seaLevel: 0.0, freeze: 0 },
  });

  const mars = mk("Mars", 38, 0.72, 0.7, 80, { atmosphere: makeAtmosPreset("Thin Mars-like", 0.25), ocean: { seaLevel: 0.0, freeze: 0 } });

  const jupiter = mk("Jupiter", 54, 2.8, 6.0, 130, { atmosphere: makeAtmosPreset("Earth-like", 0.5), ocean: { seaLevel: 0.0, freeze: 0 } });

  const saturn = mk("Saturn", 70, 2.4, 5.2, 160, {
    atmosphere: makeAtmosPreset("Earth-like", 0.45),
    ring: { inner: 2.9, outer: 4.1, seed: 123.4 },
    ocean: { seaLevel: 0.0, freeze: 0 },
  });

  const uranus = mk("Uranus", 86, 1.9, 4.0, 200, { atmosphere: makeAtmosPreset("Earth-like", 0.35), ocean: { seaLevel: 0.0, freeze: 0 } });
  const neptune = mk("Neptune", 100, 1.85, 4.2, 240, { atmosphere: makeAtmosPreset("Earth-like", 0.35), ocean: { seaLevel: 0.0, freeze: 0 } });

  return [sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune] as Body[];
}
