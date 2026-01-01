import { COMMON_GLSL } from "./common.glsl";

export const PLANET_SURFACE_VERT = /* glsl */ `
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PLANET_SURFACE_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vPosW;
varying vec3 vNormalW;
varying vec2 vUv;

uniform vec3 uSunDir;
uniform float uSeed;
uniform float uSeaLevel;
uniform float uAlbedoBoost;

vec3 palette(float t){
  vec3 a = vec3(0.25,0.25,0.28);
  vec3 b = vec3(0.25,0.22,0.20);
  vec3 c = vec3(0.90,0.80,0.65);
  vec3 d = vec3(0.20,0.25,0.30);
  return a + b*cos(6.28318*(c*t + d));
}

void main(){
  vec3 N = normalize(vNormalW);
  float ndl = max(0.0, dot(N, normalize(uSunDir)));

  // spherical mapping-ish
  vec2 p = vec2(atan(N.z, N.x), asin(N.y));
  p *= 1.6;
  p += uSeed;

  float h = fbm(p*2.0) * 0.6 + fbm(p*6.0)*0.4;
  h = pow(h, 1.25);

  // simple ocean/land split
  float sea = smoothstep(uSeaLevel - 0.02, uSeaLevel + 0.02, h);
  vec3 land = mix(vec3(0.12,0.10,0.09), palette(h), 0.65);
  land = mix(land, vec3(0.55,0.52,0.45), smoothstep(0.72,0.92,h));
  vec3 ocean = vec3(0.02,0.05,0.09) + 0.08*vec3(0.2,0.35,0.6)*fbm(p*10.0);
  vec3 albedo = mix(ocean, land, sea);

  // subtle normal perturb (cheap)
  float e = 0.001;
  float hx = fbm((p+vec2(e,0))*2.0);
  float hy = fbm((p+vec2(0,e))*2.0);
  vec3 bump = normalize(vec3((hx-h)*3.0, (hy-h)*3.0, 1.0));
  float rough = mix(0.95, 0.55, sea);

  // lighting: diffuse + subtle rim
  vec3 L = normalize(uSunDir);
  float rim = pow(1.0 - max(0.0, dot(N, normalize(-vPosW))), 2.0);
  vec3 col = albedo * (0.15 + 1.15*ndl);
  col += vec3(0.10,0.12,0.16) * rim * 0.7;

  col *= uAlbedoBoost;
  gl_FragColor = vec4(col, 1.0);
}
`;
