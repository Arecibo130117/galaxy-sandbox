import React, { useEffect, useMemo, useRef } from "react";
import { LeftPanel } from "./ui/LeftPanel";
import { ProfilerOverlay } from "./ui/ProfilerOverlay";
import { Minimap } from "./ui/Minimap";
import { ThreeRoot } from "../engine/ThreeRoot";
import { useStore } from "./state/store";
import { getPresets, applyPreset } from "../gameplay/presets";
import { loadWorldSlot, saveWorldSlot } from "../storage/indexeddb";

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const tools = useStore((s) => s.tools);
  const settings = useStore((s) => s.settings);
  const bodies = useStore((s) => s.bodies);
  const selectedId = useStore((s) => s.selectedId);
  const time = useStore((s) => s.time);
  const originOffset = useStore((s) => s.originOffset);

  const setBodies = useStore((s) => s.setBodies);
  const setSelected = useStore((s) => s.setSelected);
  const setTime = useStore((s) => s.setTime);
  const setSettings = useStore((s) => s.setSettings);
  const setTools = useStore((s) => s.setTools);
  const setOriginOffset = useStore((s) => s.setOriginOffset);

  const root = useMemo(() => new ThreeRoot(), []);

  useEffect(() => {
    if (!containerRef.current) return;

    root.attach(containerRef.current);
    root.start();

    // 최초 프리셋: Scaled Solar System
    const presets = getPresets();
    const solar = presets.find((p) => p.id === "scaled-solar-system") ?? presets[0];
    applyPreset(solar.id, { setBodies, setSelected, setTime, setSettings, setTools, setOriginOffset });
    root.onWorldChanged();

    return () => root.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // store -> engine sync
  useEffect(() => {
    root.syncFromStore({ settings, tools, bodies, selectedId, time, originOffset });
  }, [root, settings, tools, bodies, selectedId, time, originOffset]);

  // engine -> store runtime stats
  useEffect(() => {
    root.setRuntimeSink((rt) => useStore.getState().setRuntime(rt));
  }, [root]);

  const onLoadPreset = (presetId: string) => {
    useStore.getState().loadPreset(presetId as any);
    applyPreset(presetId as any, { setBodies, setSelected, setTime, setSettings, setTools, setOriginOffset });
    root.onWorldChanged();
  };

  const onSaveSlot = async (slot: 1 | 2 | 3) => {
    const snap = root.makeSnapshot();
    await saveWorldSlot(slot, snap);
  };

  const onLoadSlot = async (slot: 1 | 2 | 3) => {
    const snap = await loadWorldSlot(slot);
    if (!snap) return;
    setBodies(snap.bodies);
    setSelected(snap.selectedId);
    setTime(snap.time);
    setSettings(snap.settings);
    useStore.getState().setChallenges(snap.challenges);
    root.setCameraFromSnapshot(snap.camera);
    setOriginOffset(snap.originOffset);
    root.onWorldChanged();
  };

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 z-20 w-[360px] max-w-[36vw]">
        <LeftPanel
          onLoadPreset={onLoadPreset}
          onSaveSlot={onSaveSlot}
          onLoadSlot={onLoadSlot}
        />
      </div>

      <div className="absolute right-3 top-3 z-20 w-[280px]">
        <Minimap />
      </div>

      <ProfilerOverlay />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 text-xs text-white/70 bg-black/40 px-3 py-2 rounded-lg border border-white/10">
        LMB: select / drag orbit • RMB: orbit cam • Wheel: zoom • Shift+LMB: asteroid brush • B: spawn blackhole • P: pause • O: step
      </div>
    </div>
  );
}
