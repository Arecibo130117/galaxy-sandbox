import type { Body, ChallengeId } from "../world/types";
import type { SettingsState, ToolState } from "../app/state/store";
import { V3 } from "../utils/math";
import { useStore } from "../app/state/store";

export type ChallengeDef = { id: ChallengeId; title: string; desc: string; reward: string };

export function listChallenges(): ChallengeDef[] {
  return [
    { id: "crater-target", title: "지정 좌표 크레이터", desc: "Target에 크레이터를 지정 반경 조건으로 생성", reward: "Preset: Asteroid Range" },
    { id: "moon-escape", title: "위성 궤도 이탈", desc: "Moon이 parent로부터 30초 이탈 유지", reward: "Lens Strength +10%" },
    { id: "asteroid-ring", title: "소행성 링 유지", desc: "특정 고도 반경에 30초 링 유지", reward: "Debris High unlock" },
    { id: "bh-absorb-50", title: "블랙홀 흡수 50개", desc: "시간 제한 내 50개 흡수", reward: "Preset: Blackhole Lab" },
    { id: "tilt-change", title: "자전축 20° 변화", desc: "충돌로 tiltDeg를 20° 이상 변화", reward: "Cinematics: Auto Slowmo+" },
    { id: "strip-atmo", title: "대기 밀도 0", desc: "충돌 누적으로 atmo density 0 만들기", reward: "Preset: Saturn Rings" },
    { id: "freeze-boil", title: "해수면 결빙/증발", desc: "간단 규칙에 따라 freeze or boil 연출", reward: "Ocean FX unlock" },
    { id: "double-moon-stable", title: "이중 위성 60초 안정", desc: "위성 2개를 60초 안정 유지", reward: "Preset: Binary Stars" },
    { id: "jupiter-slingshot", title: "목성 슬링샷", desc: "속도/원일점 조건 달성", reward: "Time 100x unlock" },
    { id: "saturn-ring-gap", title: "토성 링 교란", desc: "갭 연출 + 유지", reward: "Ring Density+" },
    { id: "defend-earth", title: "지구 방어", desc: "60초 동안 Earth 충돌 방지", reward: "Shield FX cosmetic" },
  ];
}

function markDone(id: ChallengeId) {
  const s = useStore.getState();
  if (s.challenges.completed[id]) return;
  s.setChallenges({
    completed: { ...s.challenges.completed, [id]: true },
    progress: { ...s.challenges.progress, [id]: 1 },
  });
}

function setProg(id: ChallengeId, p: number) {
  const s = useStore.getState();
  if (s.challenges.completed[id]) return;
  s.setChallenges({ progress: { ...s.challenges.progress, [id]: Math.max(s.challenges.progress[id] ?? 0, p) } });
}

export function tickChallenges(bodies: Body[], s: any, dt: number) {
  const earth = bodies.find((b) => b.name === "Earth");
  const bh = bodies.find((b) => b.kind === "BlackHole");

  // (1) defend-earth: if no asteroid within earth radius for 60s
  if (earth) {
    const danger = bodies.some((b) => (b.kind === "Asteroid" || b.kind === "Debris") && V3.len(V3.sub(b.position, earth.position)) < earth.radius * 1.6);
    const key = "__defendTimer";
    (tickChallenges as any)[key] = (tickChallenges as any)[key] ?? 0;
    (tickChallenges as any)[key] = danger ? 0 : (tickChallenges as any)[key] + dt;
    setProg("defend-earth", Math.min(1, (tickChallenges as any)[key] / 60));
    if ((tickChallenges as any)[key] >= 60) markDone("defend-earth");
  }

  // (4) bh-absorb-50: simplistic counter via store
  if (bh) {
    const key = "__absorbCount";
    (tickChallenges as any)[key] = (tickChallenges as any)[key] ?? 0;
    // increment happens in engine via removing bodies near BH; here approximate via body count changes is messy.
    // We'll keep a soft progress by "presence of BH + time".
    (tickChallenges as any)["__bhTime"] = ((tickChallenges as any)["__bhTime"] ?? 0) + dt;
    setProg("bh-absorb-50", Math.min(0.3, ((tickChallenges as any)["__bhTime"] ?? 0) / 60));
  }

  // (2) moon-escape: if Moon too far from Earth 30s
  const moon = bodies.find((b) => b.name === "Moon");
  if (moon && earth) {
    const d = V3.len(V3.sub(moon.position, earth.position));
    const escaped = d > 8;
    const key = "__moonEscape";
    (tickChallenges as any)[key] = (tickChallenges as any)[key] ?? 0;
    (tickChallenges as any)[key] = escaped ? (tickChallenges as any)[key] + dt : 0;
    setProg("moon-escape", Math.min(1, (tickChallenges as any)[key] / 30));
    if ((tickChallenges as any)[key] >= 30) markDone("moon-escape");
  }

  // 기타는 "스샷/샌드박스" 성격상 트리거가 다양하므로,
  // 진행률은 데모 수준으로 유지(완료는 향후 사용자 플레이로 확장 가능)
}
