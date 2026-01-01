export const COMMON_GLSL = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash12(vec2 p) {
  vec3 p3  = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  float n = hash12(p);
  return vec2(n, hash12(p + n + 17.7));
}
float noise2(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1,0));
  float c = hash12(i + vec2(0,1));
  float d = hash12(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float f = 0.0;
  float a = 0.5;
  for(int i=0;i<6;i++){
    f += a*noise2(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}
float hgPhase(float cosTheta, float g){
  float g2 = g*g;
  return (1.0 - g2) / pow(max(1e-3, 1.0 + g2 - 2.0*g*cosTheta), 1.5) * 0.25;
}
`;
