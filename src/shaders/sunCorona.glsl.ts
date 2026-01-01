import { COMMON_GLSL } from "./common.glsl";

export const SUN_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SUN_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vNormalW;
varying vec3 vPosW;
uniform vec3 uCameraPosW;
uniform float uTime;

void main(){
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(uCameraPosW - vPosW);
  float rim = pow(1.0 - max(0.0, dot(N, V)), 2.3);

  float n = fbm(vec2(atan(N.z,N.x), asin(N.y))*6.0 + uTime*0.05);
  float corona = rim * (0.35 + 0.65*n);

  vec3 col = vec3(1.2, 0.9, 0.55) * (0.9 + 0.2*n) + vec3(1.0,0.65,0.25)*corona*1.4;
  gl_FragColor = vec4(col, 1.0);
}
`;
