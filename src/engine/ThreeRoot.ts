import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type GraphicsPreset = "Low" | "Medium" | "High" | "Cinematic++";

export type ThreeRuntime = {
  dt: number;
  time: number;
  fps: number;
  preset: GraphicsPreset;
  stats: {
    calls: number;
    triangles: number;
    lines: number;
    points: number;
    instanced: number;
  };
};

export type CameraSnapshot = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  near: number;
  far: number;
};

export type EngineSnapshot = {
  camera: CameraSnapshot;
  preset: GraphicsPreset;
  exposure: number;
};

function nowSec() {
  return performance.now() / 1000;
}

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ✅ Fix for TS2339: renderer.info.render.instances doesn't exist
function countInstancedInstances(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const anyO = o as any;
    if (anyO && anyO.isInstancedMesh) {
      const c = typeof anyO.count === "number" ? anyO.count : 0;
      total += c;
    }
  });
  return total;
}

export class ThreeRoot {
  // Core
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;

  // Post
  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private finalPass!: ShaderPass;

  // State
  private canvas: HTMLCanvasElement | null = null;
  private started = false;
  private rafId: number | null = null;

  private preset: GraphicsPreset = "High";
  private postprocessEnabled = true;
  private bloomEnabled = true;
  private exposure = 1.0;

  // timing
  private lastT = 0;
  private time = 0;
  private fps = 60;

  // instanced cache
  private instancedCached = 0;
  private instancedEveryNFrames = 10;

  // hooks/callbacks expected by App.tsx
  private worldChangedCbs = new Set<() => void>();
  private runtimeSink: ((rt: ThreeRuntime) => void) | null = null;

  // floating origin offset accumulator (for bookkeeping)
  private floatingOrigin = new THREE.Vector3(0, 0, 0);

  constructor() {
    // Intentionally empty: App.tsx calls new ThreeRoot() with no args.
  }

  /** App.tsx expects this */
  public attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.exposure;

    // Scene + Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1e7);
    this.camera.position.set(0, 10, 30);
    this.camera.lookAt(0, 0, 0);

    // Basic lights (your actual engine may overwrite)
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x111122, 0.15);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, 30, 20);
    dir.castShadow = false;
    this.scene.add(dir);

    // Composer
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.35,
      0.6,
      0.88
    );
    this.composer.addPass(this.bloomPass);

    this.finalPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main(){
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
    });
    this.composer.addPass(this.finalPass);

    this.applyPreset(this.preset);
    this.resize(canvas.clientWidth, canvas.clientHeight);

    // init time
    this.lastT = nowSec();

    // notify once
    this.emitWorldChanged();
  }

  /** App.tsx expects this */
  public start() {
    if (this.started) return;
    this.started = true;
    this.lastT = nowSec();
    this.loop();
  }

  public stop() {
    this.started = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public dispose() {
    this.stop();
    try {
      this.composer?.dispose();
      this.renderer?.dispose();
    } catch {
      // ignore
    }
    this.canvas = null;
  }

  public resize(w: number, h: number) {
    if (!this.canvas) return;
    const width = Math.max(1, w);
    const height = Math.max(1, h);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  // ---- Methods App.tsx complained about (now provided) ----

  /** App.tsx expects this */
  public onWorldChanged(cb: () => void) {
    this.worldChangedCbs.add(cb);
    return () => this.worldChangedCbs.delete(cb);
  }

  /** App.tsx expects this (store -> engine sync hook) */
  public syncFromStore() {
    // Intentionally minimal for compilation stability.
    // If your engine already has store syncing, keep it here.
  }

  /** App.tsx expects this. Typed so App callback param isn't implicit any */
  public setRuntimeSink(cb: (rt: ThreeRuntime) => void) {
    this.runtimeSink = cb;
  }

  /** App.tsx expects this */
  public makeSnapshot(): EngineSnapshot {
    const p = this.camera.position;
    const q = this.camera.quaternion;

    return {
      preset: this.preset,
      exposure: this.exposure,
      camera: {
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
      },
    };
  }

  /** App.tsx expects this */
  public setCameraFromSnapshot(s: EngineSnapshot | null | undefined) {
    if (!s) return;
    const c = s.camera;
    this.camera.position.set(c.position[0], c.position[1], c.position[2]);
    this.camera.quaternion.set(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3]);
    this.camera.fov = c.fov;
    this.camera.near = c.near;
    this.camera.far = c.far;
    this.camera.updateProjectionMatrix();

    this.exposure = s.exposure ?? this.exposure;
    this.renderer.toneMappingExposure = this.exposure;
    this.applyPreset(s.preset ?? this.preset);
  }

  // ---- Rendering controls ----

  public setExposure(exposure: number) {
    this.exposure = clamp(exposure, 0.1, 8.0);
    if (this.renderer) this.renderer.toneMappingExposure = this.exposure;
  }

  public setPostprocessEnabled(on: boolean) {
    this.postprocessEnabled = on;
  }

  public setBloomEnabled(on: boolean) {
    this.bloomEnabled = on;
  }

  public applyPreset(preset: GraphicsPreset) {
    this.preset = preset;

    if (!this.renderer) return;

    // Pixel ratio
    if (preset === "Low") this.renderer.setPixelRatio(Math.min(1.0, window.devicePixelRatio || 1));
    else if (preset === "Medium") this.renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    else if (preset === "High") this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    else this.renderer.setPixelRatio(Math.min(2.0, window.devicePixelRatio || 1));

    // Bloom tuning
    if (preset === "Low") {
      this.bloomPass.strength = 0.18;
      this.bloomPass.radius = 0.45;
      this.bloomPass.threshold = 0.92;
    } else if (preset === "Medium") {
      this.bloomPass.strength = 0.26;
      this.bloomPass.radius = 0.55;
      this.bloomPass.threshold = 0.9;
    } else if (preset === "High") {
      this.bloomPass.strength = 0.34;
      this.bloomPass.radius = 0.6;
      this.bloomPass.threshold = 0.88;
    } else {
      this.bloomPass.strength = 0.38;
      this.bloomPass.radius = 0.65;
      this.bloomPass.threshold = 0.86;
    }
  }

  /**
   * Floating origin shift (optional external call)
   * shift is applied to scene + camera to keep precision stable.
   */
  public applyFloatingOriginShift(shift: THREE.Vector3) {
    this.floatingOrigin.add(shift);

    this.scene?.traverse((o) => {
      if (o === this.camera) return;
      o.position.add(shift);
    });
    this.camera?.position.add(shift);
  }

  /** Dynamic near/far helper */
  public updateNearFar(nearHint: number, farHint: number) {
    const n = clamp(nearHint, 0.01, 5000);
    const f = clamp(farHint, 100, 5e8);

    this.camera.near = lerp(this.camera.near, n, 0.25);
    this.camera.far = lerp(this.camera.far, f, 0.25);
    this.camera.updateProjectionMatrix();
  }

  // ---- Internal loop ----

  private loop = () => {
    if (!this.started) return;

    const t = nowSec();
    const dt = Math.min(0.1, Math.max(1e-6, t - this.lastT));
    this.lastT = t;
    this.time += dt;

    const instFps = 1 / dt;
    this.fps = lerp(this.fps, instFps, 0.12);

    // cache instanced count every N frames
    const frame = this.renderer.info.render.frame ?? 0;
    if (frame % this.instancedEveryNFrames === 0) {
      this.instancedCached = countInstancedInstances(this.scene);
    }

    // render
    if (this.postprocessEnabled) {
      this.bloomPass.enabled = this.bloomEnabled;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // runtime sink
    if (this.runtimeSink) {
      const r = this.renderer.info.render;
      this.runtimeSink({
        dt,
        time: this.time,
        fps: this.fps,
        preset: this.preset,
        stats: {
          calls: r.calls,
          triangles: r.triangles,
          lines: r.lines,
          points: r.points,
          instanced: this.instancedCached,
        },
      });
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private emitWorldChanged() {
    for (const cb of this.worldChangedCbs) cb();
  }
}

export default ThreeRoot;
