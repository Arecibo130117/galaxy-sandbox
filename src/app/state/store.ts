import { create } from "zustand";
import type { Body, ChallengeState, PresetId, ToolTab, Vec3 } from "../../world/types";

export type GraphicsPreset = "Low" | "Medium" | "High" | "Cinematic++";
export type Quality = "Low" | "Med" | "High" | "Cinematic++";

export type AtmospherePreset = "Earth-like" | "Thin Mars-like" | "Dense Venus-like";
export type MaterialPreset = "Rock" | "Ice" | "Iron";

export type TimeScale = 0.25 | 1 | 5 | 20 | 100;

export type WorldSnapshot = {
  bodies: Body[];
  selectedId: string | null;
  time: { t: number; timeScale: TimeScale; paused: boolean };
  settings: SettingsState;
  challenges: ChallengeState;
  camera: { pos: Vec3; target: Vec3 };
  originOffset: Vec3;
};

export type SettingsState = {
  graphicsPreset: GraphicsPreset;
  atmosphereQuality: Quality;
  blackholeLensQuality: Quality;
  debrisCount: "Low" | "Med" | "High";
  shadows: "Off" | "Low" | "High";
  postprocess: boolean;
  dither: boolean;
  temporal: boolean;

  exposure: number;
  autoExposure: boolean;

  atmospherePreset: AtmospherePreset;
  lensStrength: number;

  gravityGScale: number;
  gravityTopK: 1 | 2;

  orbitTrails: boolean;
  orbitTrailSeconds: number;

  mode: "Realistic" | "Chaos";
};

export type ToolState = {
  activeTab: ToolTab;

  // Solar System scalers
  distanceScale: number;
  radiusScale: number;
  massScale: number;

  // Planet tool
  planetCreate: {
    radius: number;
    mass: number;
    spin: number;
    tiltDeg: number;
    atmosphereDensity: number;
    seaLevel: number;
  };

  // Asteroid tool
  asteroid: {
    brushOn: boolean;
    rate: number;
    speed: number;
    mass: number;
    material: MaterialPreset;
    directionMode: "Camera" | "RelativeToSelected";
  };

  // Impact tool
  impact: {
    speed: number;
    incidenceDeg: number;
    restitution: number;
    debrisScale: number;
    craterScale: number;
    lastEnergy: number;
  };

  // Black hole tool
  blackhole: {
    mass: number;
    horizonRadius: number;
    absorbRadius: number;
    lensStrength: number;
  };

  // Cinematics
  cinematics: {
    enabled: boolean;
    autoSlowmo: boolean;
    screenshotMode: boolean;
  };

  // Save slot
  selectedSlot: 1 | 2 | 3;

  // Focus/track
  trackId: string | null;
};

export type RuntimeState = {
  fps: number;
  drawCalls: number;
  instances: number;
  activePreset: PresetId | null;
};

type Store = {
  bodies: Body[];
  selectedId: string | null;
  originOffset: Vec3;
  time: { t: number; timeScale: TimeScale; paused: boolean };

  settings: SettingsState;
  tools: ToolState;
  challenges: ChallengeState;
  runtime: RuntimeState;

  setBodies: (b: Body[] | ((prev: Body[]) => Body[])) => void;
  setSelected: (id: string | null) => void;
  setOriginOffset: (v: Vec3) => void;

  setTime: (p: Partial<Store["time"]>) => void;
  setSettings: (p: Partial<SettingsState>) => void;
  setTools: (p: Partial<ToolState>) => void;
  setChallenges: (p: Partial<ChallengeState>) => void;
  setRuntime: (p: Partial<RuntimeState>) => void;

  loadPreset: (id: PresetId) => void;
};

const defaultSettings: SettingsState = {
  graphicsPreset: "High",
  atmosphereQuality: "High",
  blackholeLensQuality: "High",
  debrisCount: "Med",
  shadows: "Low",
  postprocess: true,
  dither: true,
  temporal: true,

  exposure: 1.0,
  autoExposure: false,

  atmospherePreset: "Earth-like",
  lensStrength: 1.0,

  gravityGScale: 1.0,
  gravityTopK: 1,

  orbitTrails: true,
  orbitTrailSeconds: 10,

  mode: "Chaos",
};

const defaultTools: ToolState = {
  activeTab: "Solar System",

  distanceScale: 0.02,
  radiusScale: 1.0,
  massScale: 1.0,

  planetCreate: {
    radius: 1.0,
    mass: 1.0,
    spin: 0.4,
    tiltDeg: 23.4,
    atmosphereDensity: 1.0,
    seaLevel: 0.02,
  },

  asteroid: {
    brushOn: false,
    rate: 20,
    speed: 8,
    mass: 0.01,
    material: "Rock",
    directionMode: "Camera",
  },

  impact: {
    speed: 14,
    incidenceDeg: 20,
    restitution: 0.1,
    debrisScale: 1.0,
    craterScale: 1.0,
    lastEnergy: 0,
  },

  blackhole: {
    mass: 20,
    horizonRadius: 0.6,
    absorbRadius: 1.2,
    lensStrength: 1.0,
  },

  cinematics: {
    enabled: true,
    autoSlowmo: true,
    screenshotMode: false,
  },

  selectedSlot: 1,
  trackId: null,
};

export const useStore = create<Store>((set, get) => ({
  bodies: [],
  selectedId: null,
  originOffset: [0, 0, 0],
  time: { t: 0, timeScale: 1, paused: false },

  settings: defaultSettings,
  tools: defaultTools,
  challenges: { progress: {}, completed: {}, unlocked: { presets: {} } },
  runtime: { fps: 0, drawCalls: 0, instances: 0, activePreset: null },

  setBodies: (b) => set((s) => ({ bodies: typeof b === "function" ? b(s.bodies) : b })),
  setSelected: (id) => set({ selectedId: id }),
  setOriginOffset: (v) => set({ originOffset: v }),

  setTime: (p) => set((s) => ({ time: { ...s.time, ...p } })),
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  setTools: (p) => set((s) => ({ tools: { ...s.tools, ...p } })),
  setChallenges: (p) => set((s) => ({ challenges: { ...s.challenges, ...p } })),
  setRuntime: (p) => set((s) => ({ runtime: { ...s.runtime, ...p } })),

  loadPreset: (id) => {
    // 실제 생성은 engine 쪽에서 수행. 여기서는 activePreset 표시만.
    get().setRuntime({ activePreset: id });
  },
}));
