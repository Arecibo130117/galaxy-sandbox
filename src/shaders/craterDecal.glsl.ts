import { COMMON_GLSL } from "./common.glsl";

export const CRATER_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CRATER_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec2 vUv;
uniform float uAge; // seconds
uniform float uScale;
uniform float uSeed;

void main(){
  vec2 p = vUv*2.0-1.0;
  float r = length(p);
  float rim = exp(-pow((r-0.65)/0.12, 2.0));
  float bowl = smoothstep(0.9, 0.0, r);
  float noise = fbm(p*6.0 + uSeed*3.0);
  float a = smoothstep(1.0, 0.0, r);
  a *= smoothstep(10.0, 0.0, uAge); // fade slowly
  vec3 col = mix(vec3(0.05), vec3(0.22,0.18,0.14), bowl);
  col += rim*0.15;
  col *= (0.75 + 0.5*noise);
  gl_FragColor = vec4(col, a*0.85);
}
`;
