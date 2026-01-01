import React from "react";

export function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur px-3 py-3">
      <div className="text-xs font-semibold text-white/80 mb-2">{props.title}</div>
      {props.children}
    </div>
  );
}

export function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-[140px] text-[11px] text-white/70">{props.label}</div>
      <div className="flex-1">{props.children}</div>
    </div>
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        className="w-full"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      <div className="w-[64px] text-right text-[11px] text-white/70 tabular-nums">
        {(props.format ? props.format(props.value) : props.value.toFixed(2))}
      </div>
    </div>
  );
}

export function Toggle(props: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      className={`px-2 py-1 rounded-lg text-[11px] border ${
        props.value ? "bg-white/15 border-white/20" : "bg-black/20 border-white/10"
      }`}
      onClick={() => props.onChange(!props.value)}
      type="button"
    >
      {props.label ?? (props.value ? "On" : "Off")}
    </button>
  );
}

export function Button(props: { children: React.ReactNode; onClick: () => void; variant?: "primary" | "ghost" }) {
  const v = props.variant ?? "ghost";
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`px-2 py-1 rounded-lg text-[11px] border ${
        v === "primary"
          ? "bg-white/15 border-white/20 hover:bg-white/20"
          : "bg-black/20 border-white/10 hover:bg-white/10"
      }`}
    >
      {props.children}
    </button>
  );
}

export function Select(props: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px]"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
