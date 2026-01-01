import type { PresetId } from "../world/types";
import { makeScaledSolarSystem } from "../world/solarSystemPreset";
import { makePlanetBase, makeAtmosPreset } from "../world/procedural";
import type { SettingsState, ToolState } from "../app/state/store";

export function getPresets(): { id: PresetId; title: string }[] {
  return [
    { id: "earth-moon", title: "Earth-Moon" },
    { id: "saturn-rings", title: "Saturn Ring 느낌" },
    { id: "asteroid-range", title: "소행성 폭격장" },
    { id: "blackhole-lab", title: "블랙홀 실험실" },
    { id: "binary-stars", title: "쌍성계(간단)" },
    { id: "scaled-solar-system", title: "Scaled Solar System" },
  ];
}

export function applyPreset(
  id: PresetId,
  api: {
    setBodies: any;
    setSelected: any;
    setTime: any;
    setSettings: any;
    setTools: any;
    setOriginOffset: any;
  }
) {
  const baseSettings: Partial<SettingsState> = {
    postprocess: true,
    dither: true,
    temporal: true,
    orbitTrails: true,
    orbitTrailSeconds: 10,
    gravityTopK: 1,
    gravityGScale: 1.0,
    atmospherePreset: "Earth-like",
    exposure: 1.0,
  };

  if (id === "scaled-solar-system") {
    api.setTools({ distanceScale: 0.02, radiusScale: 1.0, massScale: 1.0, trackId: null });
    api.setSettings({ ...baseSettings, mode: "Realistic" });
    api.setBodies(makeScaledSolarSystem(1, 1, 1, "Earth-like"));
    api.setSelected(null);
    api.setTime({ t: 0, timeScale: 20, paused: false });
    api.setOriginOffset([0, 0, 0]);
    return;
  }

  if (id === "earth-moon") {
    const sun = makePlanetBase({ name: "Sun", kind: "Star", radius: 6.5, mass: 2000, position: [0, 0, 0] });
    const earth = makePlanetBase({
      name: "Earth",
      kind: "Planet",
      radius: 1.05,
      mass: 1.0,
      position: [26, 0, 0],
      atmosphere: makeAtmosPreset("Earth-like", 1.0),
      ocean: { seaLevel: 0.02, freeze: 0 },
      rotation: { spin: 0.45, tiltDeg: 23.4, phase: 0 },
    });
    const moon = makePlanetBase({
      name: "Moon",
      kind: "Moon",
      radius: 0.28,
      mass: 0.01,
      position: [29.4, 0, 0],
      orbit: {
        parentId: earth.id,
        semiMajorAxis: 3.4,
        eccentricity: 0.03,
        inclinationDeg: 5.0,
        longitudeAscendingNodeDeg: 0,
        argumentPeriapsisDeg: 0,
        meanAnomalyAtEpochDeg: 0,
        period: 10,
      },
      ocean: { seaLevel: 0.0, freeze: 0 },
    });

    api.setTools({ distanceScale: 0.03, radiusScale: 1.2, massScale: 1.0, trackId: earth.id });
    api.setSettings({ ...baseSettings, mode: "Realistic", atmosphereQuality: "Cinematic++" });
    api.setBodies([sun, earth, moon]);
    api.setSelected(earth.id);
    api.setTime({ t: 0, timeScale: 1, paused: false });
    api.setOriginOffset([0, 0, 0]);
    return;
  }

  if (id === "saturn-rings") {
    const bodies = makeScaledSolarSystem(1, 1, 1, "Earth-like").filter((b) => ["Sun", "Saturn"].includes(b.name));
    api.setTools({ distanceScale: 0.025, radiusScale: 1.2, massScale: 1.0, trackId: bodies.find((b: any) => b.name === "Saturn")?.id ?? null });
    api.setSettings({ ...baseSettings, mode: "Realistic", orbitTrailSeconds: 18 });
    api.setBodies(bodies);
    api.setSelected(bodies.find((b: any) => b.name === "Saturn")?.id ?? null);
    api.setTime({ t: 0, timeScale: 5, paused: false });
    api.setOriginOffset([0, 0, 0]);
    return;
  }

  if (id === "asteroid-range") {
    const sun = makePlanetBase({ name: "Sun", kind: "Star", radius: 6.5, mass: 2000, position: [0, 0, 0] });
    const target = makePlanetBase({
      name: "Target",
      kind: "Planet",
      radius: 1.6,
      mass: 3.0,
      position: [30, 0, 0],
      atmosphere: makeAtmosPreset("Earth-like", 1.0),
      ocean: { seaLevel: 0.0, freeze: 0 },
      rotation: { spin: 0.2, tiltDeg: 10, phase: 0 },
    });

    api.setTools({ distanceScale: 0.03, radiusScale: 1.0, massScale: 1.2, trackId: target.id, asteroid: { ...((api as any).tools?.asteroid ?? {}), brushOn: true } });
    api.setSettings({ ...baseSettings, mode: "Chaos", debrisCount: "High", atmosphereQuality: "High" });
    api.setBodies([sun, target]);
    api.setSelected(target.id);
    api.setTime({ t: 0, timeScale: 1, paused: false });
    api.setOriginOffset([0, 0, 0]);
    return;
  }

  if (id === "blackhole-lab") {
    const sun = makePlanetBase({ name: "Sun", kind: "Star", radius: 6.5, mass: 2000, position: [0, 0, 0] });
    const planet = makePlanetBase({
      name: "Lensed Planet",
      kind: "Planet",
      radius: 1.3,
      mass: 4.0,
      position: [30, 0, 0],
      atmosphere: makeAtmosPreset("Earth-like", 0.8),
      ocean: { seaLevel: 0.02, freeze: 0 },
    });
    const bh = makePlanetBase({
      name: "Black Hole",
      kind: "BlackHole",
      radius: 0.6,
      mass: 80,
      position: [18, 0, -5],
      blackhole: { horizonRadius: 0.6, absorbRadius: 1.2, lensStrength: 1.1 },
    });

    api.setTools({ distanceScale: 0.03, radiusScale: 1.2, massScale: 1.0, trackId: bh.id });
    api.setSettings({ ...baseSettings, blackholeLensQuality: "Cinematic++", temporal: true, mode: "Chaos" });
    api.setBodies([sun, planet, bh]);
    api.setSelected(bh.id);
    api.setTime({ t: 0, timeScale: 1, paused: false });
    api.setOriginOffset([0, 0, 0]);
    return;
  }

  if (id === "binary-stars") {
    const s1 = makePlanetBase({ name: "Star A", kind: "Star", radius: 4.8, mass: 1300, position: [-10, 0, 0] });
    const s2 = makePlanetBase({ name: "Star B", kind: "Star", radius: 4.2, mass: 900, position: [10, 0, 0] });
    const p = makePlanetBase({
      name: "Circumbinary",
      kind: "Planet",
      radius: 1.2,
      mass: 2.0,
      position: [0, 0, 28],
      atmosphere: makeAtmosPreset("Earth-like", 0.9),
      ocean: { seaLevel: 0.02, freeze: 0 },
      velocity: [0.3, 0, 0],
    });

    api.setTools({ distanceScale: 0.04, radiusScale: 1.2, massScale: 1.0, trackId: p.id });
    api.setSettings({ ...baseSettings, mode: "Chaos", atmosphereQuality: "High" });
    api.setBodies([s1, s2, p]);
    api.setSelected(p.id);
    api.setTime({ t: 0, timeScale: 1, paused: false });
    api.setOriginOffset([0, 0, 0]);
  }
}
