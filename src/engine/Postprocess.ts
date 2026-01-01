import {
  Color,
  HalfFloatType,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import { LENS_FRAG, LENS_VERT } from "../shaders/lensing.glsl";
import type { Quality } from "../app/state/store";

export class Postprocess {
  composer: EffectComposer;
  renderPass: RenderPass;
  lensPass: ShaderPass;

  historyRT: WebGLRenderTarget;
  tempRT: WebGLRenderTarget;

  private frame = 0;

  constructor(renderer: any, scene: any, camera: any) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.historyRT = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
    });
    this.tempRT = this.historyRT.clone();

    const mat = new ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: {
        tScene: { value: null },
        tHistory: { value: this.historyRT.texture },

        uResolution: { value: new Vector2(1, 1) },
        uAspect: { value: 1 },

        uBHPosVS: { value: new Vector3(0, 0, -9999) },
        uHorizonR: { value: 0.04 },
        uAbsorbR: { value: 0.08 },
        uMass: { value: 10.0 },
        uStrength: { value: 1.0 },
        uTime: { value: 0 },

        uTemporal: { value: 1.0 },
        uHistoryMix: { value: 0.9 },
        uClampK: { value: 0.22 },

        uDither: { value: 1.0 },
        uFrame: { value: 0.0 },
      },
      transparent: false,
      depthWrite: false,
      depthTest: false,
    });

    this.lensPass = new ShaderPass(mat, "tScene");
    this.composer.addPass(this.lensPass);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.historyRT.setSize(w, h);
    this.tempRT.setSize(w, h);
    this.lensPass.material.uniforms.uResolution.value.set(w, h);
    this.lensPass.material.uniforms.uAspect.value = w / Math.max(1, h);
  }

  setBlackhole(viewPos: Vector3, horizonR_px: number, absorbR_px: number, mass: number, strength: number) {
    this.lensPass.material.uniforms.uBHPosVS.value.copy(viewPos);
    // map px radius -> normalized (approx)
    const w = this.lensPass.material.uniforms.uResolution.value.x;
    this.lensPass.material.uniforms.uHorizonR.value = horizonR_px / Math.max(1, w);
    this.lensPass.material.uniforms.uAbsorbR.value = absorbR_px / Math.max(1, w);
    this.lensPass.material.uniforms.uMass.value = mass;
    this.lensPass.material.uniforms.uStrength.value = strength;
  }

  setTemporal(enabled: boolean, quality: Quality) {
    this.lensPass.material.uniforms.uTemporal.value = enabled ? 1.0 : 0.0;
    const mix = quality === "Cinematic++" ? 0.93 : quality === "High" ? 0.90 : 0.86;
    const clampK = quality === "Cinematic++" ? 0.16 : quality === "High" ? 0.22 : 0.30;
    this.lensPass.material.uniforms.uHistoryMix.value = mix;
    this.lensPass.material.uniforms.uClampK.value = clampK;
  }

  setDither(enabled: boolean) {
    this.lensPass.material.uniforms.uDither.value = enabled ? 1.0 : 0.0;
  }

  render(dt: number, time: number) {
    this.frame++;
    this.lensPass.material.uniforms.uTime.value = time;
    this.lensPass.material.uniforms.uFrame.value = this.frame;

    // Render composer normally
    this.composer.render();

    // Update history by copying final output
    const r = this.composer.renderer as any;

    // Copy screen -> tempRT
    r.setRenderTarget(this.tempRT);
    r.clear();
    r.copyTextureToTexture({ x: 0, y: 0 } as any, (this.composer as any).readBuffer.texture, this.tempRT.texture);

    // swap
    const a = this.historyRT;
    this.historyRT = this.tempRT;
    this.tempRT = a;
    this.lensPass.material.uniforms.tHistory.value = this.historyRT.texture;
  }
}
