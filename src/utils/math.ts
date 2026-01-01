import type { Vec3 } from "../world/types";

export const V3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.max(1e-9, Math.hypot(a[0], a[1], a[2]));
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

export function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

export function length2(v: Vec3) {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}
