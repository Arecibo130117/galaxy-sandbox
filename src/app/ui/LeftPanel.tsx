import React, { useMemo } from "react";
import { useStore } from "../state/store";
import { Section, Row, Slider, Toggle, Button, Select } from "./widgets";
import { getPresets } from "../../gameplay/presets";
import { listChallenges } from "../../gameplay/challenges";
import type { ToolTab } from "../../world/types";

const tabs: ToolTab[] = [
  "Solar System",
  "Planet",
  "Asteroids",
  "Impact",
  "Gravity",
  "Black Hole",
  "Time Flow",
  "Cinematics",
  "Save/Load",
  "Settings",
];

export function LeftPanel(props: {
  onLoadPreset: (id: string) => void;
  onSaveSlot: (slot: 1 | 2 | 3) => void;
  onLoadSlot: (slot: 1 | 2 | 3) => void;
}) {
  const tools = useStore((s) => s.tools);
  const settings = useStore((s) => s.settings);
  const bodies = useStore((s) => s.bodies);
  const selectedId = useStore((s) => s.selectedId);
  const challenges = useStore((s) => s.challenges);

  const setTools = useStore((s) => s.setTools);
  const setSettings = useStore((s) => s.setSettings);
  const setSelected = useStore((s) => s.setSelected);

  const presets = useMemo(() => getPresets(), []);
  const challengeList = useMemo(() => listChallenges(), []);

  const selected = bodies.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="max-h-[92vh] overflow-auto pr-1">
      <div className="rounded-2xl border border-white/10 bg-black/35 backdrop-blur p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Cosmic Sandbox</div>
          <div className="text-[11px] text-white/60">High/Cinematic++ ready</div>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTools({ activeTab: t })}
              className={`px-2 py-1 rounded-lg text-[11px] border ${
                tools.activeTab === t ? "bg-white/15 border-white/20" : "bg-black/20 border-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tools.activeTab === "Solar System" && (
          <>
            <Section title="Solar System">
              <div className="flex gap-2 mb-2">
                <Button variant="primary" onClick={() => props.onLoadPreset("scaled-solar-system")}>
                  Load Solar System Preset
                </Button>
                <Button onClick={() => props.onLoadPreset("earth-moon")}>Earth-Moon</Button>
              </div>

              <Row label="Distance Scale">
                <Slider value={tools.distanceScale} min={0.002} max={0.12} step={0.001} onChange={(v) => setTools({ distanceScale: v })} />
              </Row>
              <Row label="Radius Scale">
                <Slider value={tools.radiusScale} min={0.2} max={3.0} step={0.01} onChange={(v) => setTools({ radiusScale: v })} />
              </Row>
              <Row label="Mass Scale">
                <Slider value={tools.massScale} min={0.1} max={5.0} step={0.01} onChange={(v) => setTools({ massScale: v })} />
              </Row>

              <Row label="Orbit Trails">
                <div className="flex items-center gap-2">
                  <Toggle value={settings.orbitTrails} onChange={(v) => setSettings({ orbitTrails: v })} />
                  <div className="flex-1">
                    <Slider
                      value={settings.orbitTrailSeconds}
                      min={1}
                      max={40}
                      step={1}
                      onChange={(v) => setSettings({ orbitTrailSeconds: v })}
                      format={(x) => `${x.toFixed(0)}s`}
                    />
                  </div>
                </div>
              </Row>

              <Row label="Mode">
                <Select
                  value={settings.mode}
                  onChange={(v) => setSettings({ mode: v as any })}
                  options={[
                    { label: "Chaos Mode", value: "Chaos" },
                    { label: "Realistic Mode", value: "Realistic" },
                  ]}
                />
              </Row>

              <div className="flex gap-2 mt-2">
                <Button onClick={() => setTools({ trackId: bodies.find((b) => b.name === "Sun")?.id ?? null })}>Focus Sun</Button>
                <Button onClick={() => setTools({ trackId: bodies.find((b) => b.name === "Earth")?.id ?? null })}>Focus Earth</Button>
                <Button onClick={() => setTools({ trackId: selected?.id ?? null })}>Focus Selected</Button>
              </div>
            </Section>

            <Section title="Planets List (toggle + focus)">
              <div className="max-h-[220px] overflow-auto">
                {bodies
                  .filter((b) => b.kind === "Planet" || b.kind === "Star" || b.kind === "Moon")
                  .map((b) => (
                    <div key={b.id} className="flex items-center justify-between py-1 border-b border-white/5">
                      <button
                        className="text-[11px] text-left hover:text-white/90 text-white/75"
                        onClick={() => setSelected(b.id)}
                        type="button"
                        title="Click to select"
                      >
                        {b.name}
                      </button>
                      <div className="flex items-center gap-2">
                        <Toggle value={b.visible} onChange={(v) => useStore.getState().setBodies((prev) => prev.map((x) => (x.id === b.id ? { ...x, visible: v } : x)))} />
                        <Button onClick={() => setTools({ trackId: b.id })}>Track</Button>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>

            <Section title="Presets (min 6)">
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <Button key={p.id} onClick={() => props.onLoadPreset(p.id)}>
                    {p.title}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Challenges (11)">
              <div className="max-h-[220px] overflow-auto text-[11px] text-white/70">
                {challengeList.map((c) => {
                  const prog = challenges.progress[c.id] ?? 0;
                  const done = !!challenges.completed[c.id];
                  return (
                    <div key={c.id} className="py-2 border-b border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white/80">{c.title}</div>
                        <div className={done ? "text-emerald-300" : "text-white/60"}>
                          {done ? "DONE" : `${Math.floor(prog * 100)}%`}
                        </div>
                      </div>
                      <div className="text-white/55 mt-1">{c.desc}</div>
                      <div className="text-white/45 mt-1">Reward: {c.reward}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {tools.activeTab === "Planet" && (
          <>
            <Section title="Planet: Create / Delete / Params">
              <Row label="Radius">
                <Slider value={tools.planetCreate.radius} min={0.2} max={6} step={0.01} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, radius: v } })} />
              </Row>
              <Row label="Mass">
                <Slider value={tools.planetCreate.mass} min={0.1} max={200} step={0.1} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, mass: v } })} />
              </Row>
              <Row label="Spin">
                <Slider value={tools.planetCreate.spin} min={-2} max={2} step={0.01} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, spin: v } })} />
              </Row>
              <Row label="Axial Tilt">
                <Slider value={tools.planetCreate.tiltDeg} min={0} max={90} step={0.1} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, tiltDeg: v } })} format={(x) => `${x.toFixed(1)}°`} />
              </Row>
              <Row label="Atmo Density">
                <Slider value={tools.planetCreate.atmosphereDensity} min={0} max={4} step={0.01} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, atmosphereDensity: v } })} />
              </Row>
              <Row label="Sea Level">
                <Slider value={tools.planetCreate.seaLevel} min={0} max={0.2} step={0.001} onChange={(v) => setTools({ planetCreate: { ...tools.planetCreate, seaLevel: v } })} />
              </Row>
              <div className="flex gap-2 mt-2">
                <Button variant="primary" onClick={() => useStore.getState().setTools({ ...tools })}>
                  (Tool Ready) Create with Click in World
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedId) return;
                    useStore.getState().setBodies((prev) => prev.filter((b) => b.id !== selectedId));
                    setSelected(null);
                  }}
                >
                  Delete Selected
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-white/55">
                Tip: Alt+LMB on empty space = create planet at cursor (engine handles).
              </div>
            </Section>
          </>
        )}

        {tools.activeTab === "Asteroids" && (
          <Section title="Asteroids: Brush Spray">
            <Row label="Brush">
              <Toggle value={tools.asteroid.brushOn} onChange={(v) => setTools({ asteroid: { ...tools.asteroid, brushOn: v } })} label={tools.asteroid.brushOn ? "On" : "Off"} />
            </Row>
            <Row label="Rate">
              <Slider value={tools.asteroid.rate} min={1} max={200} step={1} onChange={(v) => setTools({ asteroid: { ...tools.asteroid, rate: v } })} format={(x) => `${x.toFixed(0)}/s`} />
            </Row>
            <Row label="Speed">
              <Slider value={tools.asteroid.speed} min={1} max={80} step={0.1} onChange={(v) => setTools({ asteroid: { ...tools.asteroid, speed: v } })} />
            </Row>
            <Row label="Mass">
              <Slider value={tools.asteroid.mass} min={0.001} max={5} step={0.001} onChange={(v) => setTools({ asteroid: { ...tools.asteroid, mass: v } })} />
            </Row>
            <Row label="Material">
              <Select
                value={tools.asteroid.material}
                onChange={(v) => setTools({ asteroid: { ...tools.asteroid, material: v as any } })}
                options={[
                  { label: "Rock", value: "Rock" },
                  { label: "Ice", value: "Ice" },
                  { label: "Iron", value: "Iron" },
                ]}
              />
            </Row>
            <Row label="Direction">
              <Select
                value={tools.asteroid.directionMode}
                onChange={(v) => setTools({ asteroid: { ...tools.asteroid, directionMode: v as any } })}
                options={[
                  { label: "Camera Direction", value: "Camera" },
                  { label: "Relative to Selected", value: "RelativeToSelected" },
                ]}
              />
            </Row>
            <div className="text-[11px] text-white/55 mt-1">
              Hold <span className="text-white/80">Shift</span> + LMB drag to spray. (Camera mode = straight forward)
            </div>
          </Section>
        )}

        {tools.activeTab === "Impact" && (
          <Section title="Impact: Energy / Debris / Crater">
            <Row label="Speed">
              <Slider value={tools.impact.speed} min={1} max={120} step={0.1} onChange={(v) => setTools({ impact: { ...tools.impact, speed: v } })} />
            </Row>
            <Row label="Incidence">
              <Slider value={tools.impact.incidenceDeg} min={0} max={89} step={0.1} onChange={(v) => setTools({ impact: { ...tools.impact, incidenceDeg: v } })} format={(x) => `${x.toFixed(1)}°`} />
            </Row>
            <Row label="Restitution">
              <Slider value={tools.impact.restitution} min={0} max={1} step={0.01} onChange={(v) => setTools({ impact: { ...tools.impact, restitution: v } })} />
            </Row>
            <Row label="Debris Scale">
              <Slider value={tools.impact.debrisScale} min={0.2} max={5} step={0.01} onChange={(v) => setTools({ impact: { ...tools.impact, debrisScale: v } })} />
            </Row>
            <Row label="Crater Scale">
              <Slider value={tools.impact.craterScale} min={0.2} max={6} step={0.01} onChange={(v) => setTools({ impact: { ...tools.impact, craterScale: v } })} />
            </Row>
            <Row label="Energy (½mv²)">
              <div className="text-[11px] text-white/70 tabular-nums">
                {tools.impact.lastEnergy.toFixed(2)}
              </div>
            </Row>
            <div className="text-[11px] text-white/55">
              Engine computes energy on collision & drives flash/shockwave/debris/crater.
            </div>
          </Section>
        )}

        {tools.activeTab === "Gravity" && (
          <Section title="Gravity: G scale / Top-K influence / Visualization">
            <Row label="G Scale">
              <Slider value={settings.gravityGScale} min={0.1} max={5} step={0.01} onChange={(v) => setSettings({ gravityGScale: v })} />
            </Row>
            <Row label="Top-K Sources">
              <Select
                value={String(settings.gravityTopK)}
                onChange={(v) => setSettings({ gravityTopK: (v === "2" ? 2 : 1) as any })}
                options={[
                  { label: "1 (fast)", value: "1" },
                  { label: "2 (better)", value: "2" },
                ]}
              />
            </Row>
            <Row label="Gravity Visual">
              <div className="flex gap-2">
                <Toggle
                  value={!!useStore.getState().runtime}
                  onChange={() => {}}
                  label="Vectors/Contours/Lens (engine)"
                />
              </div>
            </Row>
            <div className="text-[11px] text-white/55">
              Full N×N is forbidden; each object uses top 1~2 influencers (+blackhole if present).
            </div>
          </Section>
        )}

        {tools.activeTab === "Black Hole" && (
          <Section title="Black Hole: Spawn / Move / Lens / Absorb FX">
            <Row label="Mass">
              <Slider value={tools.blackhole.mass} min={1} max={400} step={0.1} onChange={(v) => setTools({ blackhole: { ...tools.blackhole, mass: v } })} />
            </Row>
            <Row label="Horizon Radius">
              <Slider value={tools.blackhole.horizonRadius} min={0.05} max={6} step={0.01} onChange={(v) => setTools({ blackhole: { ...tools.blackhole, horizonRadius: v } })} />
            </Row>
            <Row label="Absorb Radius">
              <Slider value={tools.blackhole.absorbRadius} min={0.05} max={12} step={0.01} onChange={(v) => setTools({ blackhole: { ...tools.blackhole, absorbRadius: v } })} />
            </Row>
            <Row label="Lens Strength">
              <Slider value={tools.blackhole.lensStrength} min={0} max={3} step={0.01} onChange={(v) => setTools({ blackhole: { ...tools.blackhole, lensStrength: v } })} />
            </Row>
            <div className="flex gap-2 mt-2">
              <Button variant="primary" onClick={() => { /* engine hotkey also */ }}>
                Spawn at Cursor (press B)
              </Button>
              <Button onClick={() => setSettings({ blackholeLensQuality: "Cinematic++", temporal: true })}>
                Cinematic Lens
              </Button>
            </div>
            <div className="text-[11px] text-white/55 mt-2">
              Absorb triggers photon flash + subtle gravity-wave ring (optional) + bloom.
            </div>
          </Section>
        )}

        {tools.activeTab === "Time Flow" && (
          <Section title="Time Flow: Pause / Step / Multiplier">
            <div className="flex gap-2 mb-2">
              {[0.25, 1, 5, 20, 100].map((x) => (
                <Button key={x} onClick={() => useStore.getState().setTime({ timeScale: x as any })}>
                  {x}x
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => useStore.getState().setTime({ paused: !useStore.getState().time.paused })}>
                {useStore.getState().time.paused ? "Resume" : "Pause"}
              </Button>
              <Button onClick={() => useStore.getState().setTime({ paused: true })}>Hold</Button>
              <Button onClick={() => (window as any).__STEP_ONE_FRAME__?.()}>1 Frame Step</Button>
            </div>
            <div className="text-[11px] text-white/55 mt-2">
              Hotkeys: P pause, O step.
            </div>
          </Section>
        )}

        {tools.activeTab === "Cinematics" && (
          <Section title="Cinematics: Slowmo + Camera + Screenshot Mode">
            <Row label="Cinematics">
              <Toggle value={tools.cinematics.enabled} onChange={(v) => setTools({ cinematics: { ...tools.cinematics, enabled: v } })} />
            </Row>
            <Row label="Auto Slowmo">
              <Toggle value={tools.cinematics.autoSlowmo} onChange={(v) => setTools({ cinematics: { ...tools.cinematics, autoSlowmo: v } })} />
            </Row>
            <Row label="Screenshot Mode">
              <Toggle value={tools.cinematics.screenshotMode} onChange={(v) => setTools({ cinematics: { ...tools.cinematics, screenshotMode: v } })} />
            </Row>
            <div className="text-[11px] text-white/55 mt-1">
              Screenshot mode: pause-only; renderer does 2~4x accumulation sub-steps for one frame.
            </div>
          </Section>
        )}

        {tools.activeTab === "Save/Load" && (
          <Section title="Save/Load: IndexedDB Slots (3)">
            <Row label="Slot">
              <Select
                value={String(tools.selectedSlot)}
                onChange={(v) => setTools({ selectedSlot: (v === "2" ? 2 : v === "3" ? 3 : 1) as any })}
                options={[
                  { label: "Slot 1", value: "1" },
                  { label: "Slot 2", value: "2" },
                  { label: "Slot 3", value: "3" },
                ]}
              />
            </Row>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => props.onSaveSlot(tools.selectedSlot)}>Save</Button>
              <Button onClick={() => props.onLoadSlot(tools.selectedSlot)}>Load</Button>
            </div>
            <div className="text-[11px] text-white/55 mt-2">
              Saved: bodies, params, seeds, time, camera, challenges, graphics settings, originOffset.
            </div>
          </Section>
        )}

        {tools.activeTab === "Settings" && (
          <>
            <Section title="Graphics Preset">
              <Row label="Preset">
                <Select
                  value={settings.graphicsPreset}
                  onChange={(v) => setSettings({ graphicsPreset: v as any })}
                  options={[
                    { label: "Low", value: "Low" },
                    { label: "Medium", value: "Medium" },
                    { label: "High", value: "High" },
                    { label: "Cinematic++", value: "Cinematic++" },
                  ]}
                />
              </Row>
              <Row label="Postprocess">
                <Toggle value={settings.postprocess} onChange={(v) => setSettings({ postprocess: v })} />
              </Row>
              <Row label="Shadows">
                <Select
                  value={settings.shadows}
                  onChange={(v) => setSettings({ shadows: v as any })}
                  options={[
                    { label: "Off", value: "Off" },
                    { label: "Low", value: "Low" },
                    { label: "High", value: "High" },
                  ]}
                />
              </Row>
              <Row label="Debris Count">
                <Select
                  value={settings.debrisCount}
                  onChange={(v) => setSettings({ debrisCount: v as any })}
                  options={[
                    { label: "Low", value: "Low" },
                    { label: "Med", value: "Med" },
                    { label: "High", value: "High" },
                  ]}
                />
              </Row>
            </Section>

            <Section title="Atmosphere / Lens Quality">
              <Row label="Atmosphere Quality">
                <Select
                  value={settings.atmosphereQuality}
                  onChange={(v) => setSettings({ atmosphereQuality: v as any })}
                  options={[
                    { label: "Low", value: "Low" },
                    { label: "Med", value: "Med" },
                    { label: "High", value: "High" },
                    { label: "Cinematic++", value: "Cinematic++" },
                  ]}
                />
              </Row>
              <Row label="Atmo Preset">
                <Select
                  value={settings.atmospherePreset}
                  onChange={(v) => setSettings({ atmospherePreset: v as any })}
                  options={[
                    { label: "Earth-like", value: "Earth-like" },
                    { label: "Thin Mars-like", value: "Thin Mars-like" },
                    { label: "Dense Venus-like", value: "Dense Venus-like" },
                  ]}
                />
              </Row>
              <Row label="Lens Quality">
                <Select
                  value={settings.blackholeLensQuality}
                  onChange={(v) => setSettings({ blackholeLensQuality: v as any })}
                  options={[
                    { label: "Low", value: "Low" },
                    { label: "Med", value: "Med" },
                    { label: "High", value: "High" },
                    { label: "Cinematic++", value: "Cinematic++" },
                  ]}
                />
              </Row>
              <Row label="Lens Strength">
                <Slider value={settings.lensStrength} min={0} max={2.5} step={0.01} onChange={(v) => setSettings({ lensStrength: v })} />
              </Row>
            </Section>

            <Section title="Stability: Dither / Temporal">
              <Row label="Dither">
                <Toggle value={settings.dither} onChange={(v) => setSettings({ dither: v })} />
              </Row>
              <Row label="Temporal">
                <Toggle value={settings.temporal} onChange={(v) => setSettings({ temporal: v })} />
              </Row>
            </Section>

            <Section title="Tone / Exposure">
              <Row label="Exposure">
                <Slider value={settings.exposure} min={0.2} max={3.0} step={0.01} onChange={(v) => setSettings({ exposure: v })} />
              </Row>
              <Row label="Auto Exposure">
                <Toggle value={settings.autoExposure} onChange={(v) => setSettings({ autoExposure: v })} />
              </Row>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
