export function smoothDamp(current: number, target: number, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt);
  return current + (target - current) * t;
}
