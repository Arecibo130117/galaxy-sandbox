import { COMMON_GLSL } from "./common.glsl";

export const ATMOS_VERT = /* glsl */ `
varying vec3 vPosW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const ATMOS_FRAG = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vPosW;

uniform vec3 uCameraPosW;
uniform vec3 uSunDir;

uniform float uPlanetRadius;
uniform float uAtmoHeight;

uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uMieG;
uniform float uHR;
uniform float uHM;

uniform float uSunIntensity;
uniform float uExposure;
uniform float uDither;
uniform float uFrame;

uniform int uPrimarySteps;
uniform int uLightSteps;

// Ray-sphere intersection
bool raySphere(vec3 ro, vec3 rd, float r, out float t0, out float t1){
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r*r;
  float h = b*b - c;
  if(h < 0.0) return false;
  h = sqrt(h);
  t0 = -b - h;
  t1 = -b + h;
  return true;
}

float densityR(float h){ return exp(-h / max(1e-3, uHR)); }
float densityM(float h){ return exp(-h / max(1e-3, uHM)); }

// Multi-scattering cheap approx: energy-preserving boost dependent on optical depth
vec3 multiScatterBoost(vec3 single, vec3 tau){
  // tau ~ optical depth RGB; more tau => more multiple scattering contribution but saturating
  vec3 s = 1.0 - exp(-tau * 1.2);
  // slightly bluish lift (sky glow)
  vec3 tint = vec3(0.65, 0.78, 1.0);
  return single + single * s * tint * 0.75;
}

void main(){
  // view ray from camera to this fragment on atmosphere shell
  vec3 ro = uCameraPosW;
  vec3 rd = normalize(vPosW - ro);

  float rAtmo = uPlanetRadius + uAtmoHeight;

  float tA0, tA1;
  if(!raySphere(ro, rd, rAtmo, tA0, tA1)) discard;

  float tP0, tP1;
  bool hitPlanet = raySphere(ro, rd, uPlanetRadius, tP0, tP1);

  float tStart = max(tA0, 0.0);
  float tEnd = tA1;
  if(hitPlanet) tEnd = min(tEnd, tP0); // stop at ground

  float segment = max(0.0, tEnd - tStart);
  if(segment <= 1e-5) discard;

  // dithering / jitter
  float jitter = 0.0;
  if(uDither > 0.5){
    jitter = (hash12(gl_FragCoord.xy + vec2(uFrame, uFrame*1.37)) - 0.5);
  }

  float dt = segment / float(uPrimarySteps);
  float t = tStart + dt * (0.5 + jitter);

  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  vec3 tau = vec3(0.0);

  for(int i=0;i<128;i++){
    if(i >= uPrimarySteps) break;
    vec3 p = ro + rd * t;
    float h = length(p) - uPlanetRadius;
    float dR = densityR(h);
    float dM = densityM(h);

    // optical depth along view
    vec3 dTau = (uBetaR * dR + uBetaM * dM) * dt;
    tau += dTau;

    // light ray integration from p toward sun
    float l0, l1;
    if(!raySphere(p, uSunDir, rAtmo, l0, l1)){
      t += dt; continue;
    }
    float lEnd = l1;
    if(raySphere(p, uSunDir, uPlanetRadius, l0, l1)){
      // in shadow
      t += dt; continue;
    }

    float lSeg = max(0.0, lEnd);
    float ldt = lSeg / float(uLightSteps);
    float lt = ldt * 0.5;

    vec3 tauL = vec3(0.0);
    for(int j=0;j<64;j++){
      if(j >= uLightSteps) break;
      vec3 lp = p + uSunDir * lt;
      float lh = length(lp) - uPlanetRadius;
      float ldR = densityR(lh);
      float ldM = densityM(lh);
      tauL += (uBetaR * ldR + uBetaM * ldM) * ldt;
      lt += ldt;
    }

    vec3 trans = exp(-(tau + tauL));
    sumR += dR * trans;
    sumM += dM * trans;

    t += dt;
  }

  float mu = dot(rd, uSunDir);
  float phaseR = 3.0/(16.0*3.14159) * (1.0 + mu*mu);
  float phaseM = hgPhase(mu, uMieG);

  vec3 single = (sumR * uBetaR * phaseR + sumM * uBetaM * phaseM) * uSunIntensity;

  vec3 col = multiScatterBoost(single, tau);

  // exposure
  col = 1.0 - exp(-col * uExposure);

  gl_FragColor = vec4(col, 1.0);
}
`;
