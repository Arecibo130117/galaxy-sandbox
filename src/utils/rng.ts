export function hash11(x: number) {
  const s = Math.sin(x * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}
export function hash31(x: number, y: number, z: number) {
  return hash11(x * 12.9898 + y * 78.233 + z * 37.719);
}
export function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
