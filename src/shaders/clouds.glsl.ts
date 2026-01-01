import { COMMON_GLSL } from "./common.glsl";

export const CLOUDS_VERT = /* glsl */ `
varying vec3 vPosW;
varying vec3 vNormalW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CLOUDS_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vPosW;
varying vec3 vNormalW;

uniform vec3 uCameraPosW;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uSeed;
uniform float uCoverage;
uniform float uThickness;
uniform float uDither;
uniform float uFrame;

void main(){
  vec3 N = normalize(vNormalW);

  // procedural cloud density on sphere
  vec2 p = vec2(atan(N.z, N.x), asin(N.y));
  p = p*2.5 + vec2(uSeed, uSeed*0.7);
  p += vec2(uTime*0.02, uTime*0.015);

  float n = fbm(p*3.0);
  float n2 = fbm(p*7.0 + 19.0);
  float d = mix(n, n2, 0.35);
  d = smoothstep(uCoverage, 1.0, d);
  d *= smoothstep(0.0, 1.0, (N.y*0.5+0.5)); // slightly more at equator-ish

  // thickness modulation
  d *= mix(0.6, 1.2, fbm(p*1.2+7.0));
  d *= uThickness;

  // lighting with forward scattering highlight
  vec3 V = normalize(uCameraPosW - vPosW);
  float mu = dot(V, uSunDir);
  float forward = hgPhase(mu, 0.78);
  float ndl = max(0.0, dot(N, uSunDir));

  // cheap self-shadow feel
  float shadow = 1.0 - 0.65*smoothstep(0.2, 1.0, fbm(p*10.0+31.0));
  shadow *= mix(0.55, 1.0, ndl);

  vec3 base = vec3(1.0) * (0.10 + 0.85*ndl) * shadow;
  vec3 highlight = vec3(1.0, 0.98, 0.95) * forward * 0.35;

  vec3 col = base + highlight;

  // dither to reduce banding on alpha
  float a = d;
  if(uDither>0.5){
    a += (hash12(gl_FragCoord.xy + vec2(uFrame, uFrame*2.1)) - 0.5) * 0.015;
  }
  a = clamp(a, 0.0, 1.0);

  gl_FragColor = vec4(col, a);
}
`;
