export function advanceTime(t: number, dt: number, timeScale: number, paused: boolean) {
  if (paused) return t;
  return t + dt * timeScale;
}
