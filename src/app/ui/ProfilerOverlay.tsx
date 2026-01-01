import React from "react";
import { useStore } from "../state/store";

export function ProfilerOverlay() {
  const rt = useStore((s) => s.runtime);
  const settings = useStore((s) => s.settings);

  return (
    <div className="absolute left-3 bottom-3 z-30 text-[11px] text-white/80 bg-black/50 border border-white/10 rounded-xl px-3 py-2 backdrop-blur">
      <div className="font-semibold text-white/90 mb-1">Profiler</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <div>FPS</div><div className="text-right">{rt.fps.toFixed(0)}</div>
        <div>Draw Calls</div><div className="text-right">{rt.drawCalls}</div>
        <div>Instances</div><div className="text-right">{rt.instances}</div>
        <div>Preset</div><div className="text-right">{settings.graphicsPreset}</div>
      </div>
    </div>
  );
}
