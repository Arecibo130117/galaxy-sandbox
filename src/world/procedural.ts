import type { Body } from "./types";

export function makeAtmosPreset(name: "Earth-like" | "Thin Mars-like" | "Dense Venus-like", density: number) {
  if (name === "Thin Mars-like") {
    return {
      density,
      planetRadius: 1.0,
      atmosphereHeight: 0.18,
      betaRayleigh: [3.5e-3, 7.5e-3, 14.0e-3] as any,
      betaMie: [6e-3, 6e-3, 6e-3] as any,
      mieG: 0.70,
      scaleHeightR: 0.10,
      scaleHeightM: 0.04,
      sunIntensity: 10.0,
    };
  }
  if (name === "Dense Venus-like") {
    return {
      density,
      planetRadius: 1.0,
      atmosphereHeight: 0.30,
      betaRayleigh: [7.0e-3, 12.0e-3, 18.0e-3] as any,
      betaMie: [28e-3, 28e-3, 28e-3] as any,
      mieG: 0.82,
      scaleHeightR: 0.14,
      scaleHeightM: 0.08,
      sunIntensity: 16.0,
    };
  }
  // Earth-like
  return {
    density,
    planetRadius: 1.0,
    atmosphereHeight: 0.25,
    betaRayleigh: [5.8e-3, 13.5e-3, 33.1e-3] as any,
    betaMie: [21e-3, 21e-3, 21e-3] as any,
    mieG: 0.76,
    scaleHeightR: 0.12,
    scaleHeightM: 0.05,
    sunIntensity: 14.0,
  };
}

export function makePlanetBase(partial: Partial<Body>): Body {
  const id = crypto.randomUUID();
  return {
    id,
    name: partial.name ?? "Planet",
    kind: partial.kind ?? "Planet",
    visible: true,

    position: partial.position ?? [0, 0, 0],
    velocity: partial.velocity ?? [0, 0, 0],

    radius: partial.radius ?? 1,
    mass: partial.mass ?? 1,

    rotation: partial.rotation ?? { spin: 0.2, tiltDeg: 10, phase: 0 },
    materialSeed: partial.materialSeed ?? Math.random() * 1000,

    atmosphere: partial.atmosphere,
    ocean: partial.ocean ?? { seaLevel: 0.02, freeze: 0 },

    orbit: partial.orbit,
    ring: partial.ring,
    blackhole: partial.blackhole,
    trail: partial.trail ?? { enabled: true, seconds: 10 },
    tags: partial.tags ?? [],
  };
}
