import { COMMON_GLSL } from "./common.glsl";

export const LENS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const LENS_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tHistory;

uniform vec2 uResolution;
uniform float uAspect;

uniform vec3 uBHPosVS;       // blackhole position in view space
uniform float uHorizonR;     // horizon radius (world scaled) mapped to screen
uniform float uAbsorbR;      // absorb radius (visual)
uniform float uMass;
uniform float uStrength;
uniform float uTime;

uniform float uTemporal;     // 0/1
uniform float uHistoryMix;   // default ~0.90 for cinematic
uniform float uClampK;       // clamp range

uniform float uDither;
uniform float uFrame;

vec3 sampleScene(vec2 uv){
  return texture2D(tScene, uv).rgb;
}

// approximate gravitational deflection: alpha ~ 4GM/b (in some units) ; here tuned for visual
vec2 deflect(vec2 uv, vec2 center, float mass, float strength){
  vec2 p = (uv - center);
  p.x *= uAspect;
  float b = length(p);
  float invb = 1.0 / max(1e-4, b);
  float alpha = strength * mass * invb * invb * 0.0012; // not radial distortion; "bend" grows sharply near center
  vec2 dir = normalize(p);
  // bend direction slightly toward tangential to mimic lensing arcs near photon sphere
  vec2 tang = vec2(-dir.y, dir.x);
  float swirl = smoothstep(0.0, 0.25, 1.0 - b) * 0.35;
  vec2 bendDir = normalize(mix(dir, tang, swirl));
  vec2 offset = bendDir * alpha;

  offset.x /= uAspect;
  return offset;
}

void main(){
  // blackhole center projected in view space:
  // we pass uBHPosVS.xyz; create screen center approx using perspective-ish heuristic:
  // center ~ 0.5 + (x/z)/2
  float z = max(0.25, -uBHPosVS.z);
  vec2 center = vec2(0.5) + vec2(uBHPosVS.x, uBHPosVS.y) / (z * 2.0);

  vec2 uv = vUv;

  // multi-sample for cinematic stability
  int S = 1;
  if(uTemporal > 0.5) S = 2;
  vec3 col = vec3(0.0);

  for(int i=0;i<4;i++){
    if(i>=S) break;
    vec2 j = vec2(0.0);
    if(uDither>0.5){
      j = (hash22(gl_FragCoord.xy + vec2(float(i)*13.1 + uFrame, uFrame*1.7)) - 0.5) / uResolution;
    }
    vec2 uvs = uv + j;

    vec2 off = deflect(uvs, center, uMass, uStrength);
    vec2 duv = uvs + off;

    vec3 s = sampleScene(duv);

    // horizon + photon ring + accretion disk (procedural)
    vec2 dp = (uvs - center);
    dp.x *= uAspect;
    float r = length(dp);

    // horizon mask
    float horizon = smoothstep(uHorizonR, uHorizonR*0.92, r);

    // photon ring: thin bright ring
    float ring = exp(-pow((r - uHorizonR*1.35) / max(1e-3, uHorizonR*0.12), 2.0));
    ring *= 1.2;

    // accretion disk: plane-ish around center, rotated
    float ang = atan(dp.y, dp.x);
    float diskR = smoothstep(uHorizonR*1.6, uHorizonR*5.0, r) * (1.0 - smoothstep(uHorizonR*5.0, uHorizonR*8.0, r));
    float swirl = fbm(vec2(ang*3.0 + uTime*0.35, r*12.0 - uTime*1.5));
    swirl = smoothstep(0.25, 0.95, swirl);

    // thickness by viewing angle (fake): more transparent when near vertical
    float thickness = 1.0 - smoothstep(0.0, 0.6, abs(dp.y) / max(1e-3, r));
    float disk = diskR * swirl * thickness;

    vec3 diskCol = mix(vec3(0.9,0.75,0.5), vec3(1.0,0.95,0.85), smoothstep(uHorizonR*1.6, uHorizonR*4.0, r));
    diskCol *= (0.35 + 1.3*swirl);

    // combine
    vec3 bhCol = s;
    // absorb region adds subtle darkening
    float absorb = smoothstep(uAbsorbR, uAbsorbR*0.9, r);
    bhCol *= mix(1.0, 0.55, absorb*0.4);

    // horizon -> black disk
    bhCol *= horizon;

    // add ring and disk
    bhCol += diskCol * disk * 0.7;
    bhCol += vec3(1.0,0.98,0.95) * ring * 0.35;

    col += bhCol;
  }
  col /= float(S);

  // temporal accumulation (stability)
  if(uTemporal > 0.5){
    vec3 h = texture2D(tHistory, uv).rgb;

    // clamp history around current to reduce ghosting
    vec3 minC = col - vec3(uClampK);
    vec3 maxC = col + vec3(uClampK);
    vec3 hc = clamp(h, minC, maxC);

    col = mix(col, hc, uHistoryMix);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
