export const SHOCK_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SHOCK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uT;      // 0..1
uniform float uEnergy; // scaled
uniform vec3 uColor;

void main(){
  // ring
  vec2 p = vUv*2.0-1.0;
  float r = length(p);
  float ring = exp(-pow((r - mix(0.05, 1.2, uT)) / 0.06, 2.0));
  float fade = (1.0 - uT);
  float a = ring * fade * clamp(uEnergy, 0.2, 6.0) * 0.18;
  gl_FragColor = vec4(uColor, a);
}
`;
