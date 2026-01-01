export type Vec3 = [number, number, number];

export type BodyKind = "Star" | "Planet" | "Moon" | "Asteroid" | "Debris" | "BlackHole";

export type Orbit = {
  parentId: string;
  semiMajorAxis: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeAscendingNodeDeg: number;
  argumentPeriapsisDeg: number;
  meanAnomalyAtEpochDeg: number;
  period: number; // simulated seconds
};

export type Body = {
  id: string;
  name: string;
  kind: BodyKind;
  visible: boolean;

  position: Vec3;
  velocity: Vec3;

  radius: number;
  mass: number;

  rotation: { spin: number; tiltDeg: number; phase: number }; // rad/sec
  materialSeed: number;

  atmosphere?: {
    density: number;
    planetRadius: number;
    atmosphereHeight: number;
    betaRayleigh: Vec3;
    betaMie: Vec3;
    mieG: number;
    scaleHeightR: number;
    scaleHeightM: number;
    sunIntensity: number;
  };

  ocean?: { seaLevel: number; freeze: number }; // 0..1

  orbit?: Orbit;

  ring?: { inner: number; outer: number; seed: number };

  blackhole?: { horizonRadius: number; absorbRadius: number; lensStrength: number };

  trail?: { enabled: boolean; seconds: number };

  tags?: string[];
};

export type ToolTab =
  | "Solar System"
  | "Planet"
  | "Asteroids"
  | "Impact"
  | "Gravity"
  | "Black Hole"
  | "Time Flow"
  | "Cinematics"
  | "Save/Load"
  | "Settings";

export type PresetId =
  | "earth-moon"
  | "saturn-rings"
  | "asteroid-range"
  | "blackhole-lab"
  | "binary-stars"
  | "scaled-solar-system";

export type ChallengeId =
  | "crater-target"
  | "moon-escape"
  | "asteroid-ring"
  | "bh-absorb-50"
  | "tilt-change"
  | "strip-atmo"
  | "freeze-boil"
  | "double-moon-stable"
  | "jupiter-slingshot"
  | "saturn-ring-gap"
  | "defend-earth";

export type ChallengeState = {
  progress: Record<string, number>;
  completed: Record<string, boolean>;
  unlocked: { presets: Record<string, boolean> };
};
