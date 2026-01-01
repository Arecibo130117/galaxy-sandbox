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

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowSec() {
  return performance.now() / 1000;
}

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * three.js renderer.info.render.instances 는 존재하지 않습니다.
 * InstancedMesh.count 합산으로 인스턴스 수를 계산합니다.
 */
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

function isCanvas(el: Element): el is HTMLCanvasElement {
  return el instanceof HTMLCanvasElement;
}

function isHTMLElement(el: any): el is HTMLElement {
  return el && typeof el === "object" && typeof el.tagName === "string";
}

function vec3FromAny(v: any): THREE.Vector3 | null {
  if (!v) return null;
  if (Array.isArray(v) && v.length >= 3) return new THREE.Vector3(v[0], v[1], v[2]);
  if (typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number") {
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ThreeRoot
// ─────────────────────────────────────────────────────────────────────────────

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

  // Host elements
  private host: HTMLElement | null = null; // DIV container from App
  private canvas: HTMLCanvasElement | null = null;

  // Lifecycle
  private started = false;
  private rafId: number | null = null;
  private resizeObs: ResizeObserver | null = null;

  // Render settings
  private preset: GraphicsPreset = "High";
  private postprocessEnabled = true;
  private bloomEnabled = true;
  private exposure = 1.0;

  // Timing
  private lastT = 0;
  private time = 0;
  private fps = 60;

  // Instanced cache
  private instancedCached = 0;
  private instancedEveryNFrames = 10;

  // “world changed” callbacks (App에서 cb 등록/emit 둘 다 쓰는 패턴 대응)
  private worldChangedCbs = new Set<() => void>();

  // runtime sink
  private runtimeSink: ((rt: ThreeRuntime) => void) | null = null;

  // last store snapshot (save/load에서 WorldSnapshot 타입 mismatch 방지용)
  private lastWorldSnapshot: any = null;

  // floating origin bookkeeping
  private floatingOrigin = new THREE.Vector3(0, 0, 0);

  constructor() {
    // App.tsx: new ThreeRoot() 0-arg 호출 대응
  }

  /**
   * App.tsx는 attach(divRef.current) 형태로 DIV를 넘깁니다.
   * - DIV/HTMLElement면 내부에 canvas를 만들어 붙입니다.
   * - canvas가 직접 오면 그걸 사용합니다.
   */
  public attach(target: HTMLElement | HTMLCanvasElement) {
    if (!isHTMLElement(target)) {
      throw new Error("ThreeRoot.attach(target): target must be HTMLElement or HTMLCanvasElement");
    }

    // teardown previous
    this.teardownHost();

    if (isCanvas(target)) {
      this.canvas = target;
      this.host = target.parentElement as HTMLElement | null;
    } else {
      this.host = target;
      const c = document.createElement("canvas");
      c.style.width = "100%";
      c.style.height = "100%";
      c.style.display = "block";
      c.style.touchAction = "none";
      this.host.appendChild(c);
      this.canvas = c;
    }

    // init renderer/scene/camera/composer
    this.initThree();

    // Resize observer (host 또는 canvas 기준)
    this.resizeObs = new ResizeObserver(() => {
      this.resizeToHost();
    });
    if (this.host) this.resizeObs.observe(this.host);
    else if (this.canvas) this.resizeObs.observe(this.canvas);

    this.resizeToHost();

    // init time
    this.lastT = nowSec();

    // initial emit
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
    this.teardownHost();
  }

  /**
   * App.tsx에서 onWorldChanged()를 2가지로 사용 중:
   * 1) onWorldChanged(cb) : subscribe
   * 2) onWorldChanged()   : emit (강제 갱신)
   */
  public onWorldChanged(cb?: () => void) {
    if (typeof cb === "function") {
      this.worldChangedCbs.add(cb);
      return () => this.worldChangedCbs.delete(cb);
    }
    // cb 없이 호출되면 emit
    this.emitWorldChanged();
    return undefined;
  }

  /**
   * App.tsx가 syncFromStore(arg)로 호출하는 패턴 대응:
   * - arg를 받되, 타입은 any로 유연화
   * - 저장/불러오기 스냅샷을 위해 lastWorldSnapshot에 보관
   */
  public syncFromStore(storeOrSnapshot?: any) {
    if (storeOrSnapshot == null) return;

    // (1) store.getState() 형태면 상태를 저장
    if (typeof storeOrSnapshot.getState === "function") {
      try {
        this.lastWorldSnapshot = storeOrSnapshot.getState();
      } catch {
        this.lastWorldSnapshot = storeOrSnapshot;
      }
      return;
    }

    // (2) 그냥 스냅샷/상태 객체면 그대로 저장
    this.lastWorldSnapshot = storeOrSnapshot;
  }

  /** App.tsx expects this; typed so callback param isn't implicit any */
  public setRuntimeSink(cb: (rt: ThreeRuntime) => void) {
    this.runtimeSink = cb;
  }

  /**
   * App.tsx가 WorldSnapshot을 기대하는데,
   * 타입이 프로젝트마다 다르므로 반환 타입을 any로 유연화.
   *
   * - 가능한 경우 lastWorldSnapshot을 그대로 반환 (Save/Load에 가장 잘 맞음)
   * - 없으면 최소한 camera 정보를 포함하는 객체 반환
   */
  public makeSnapshot(): any {
    if (this.lastWorldSnapshot != null) return this.lastWorldSnapshot;

    const p = this.camera?.position ?? new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera?.quaternion ?? new THREE.Quaternion());
    const target = p.clone().add(dir.multiplyScalar(10));

    return {
      camera: {
        pos: { x: p.x, y: p.y, z: p.z },
        target: { x: target.x, y: target.y, z: target.z },
      },
      preset: this.preset,
      exposure: this.exposure,
    };
  }

  /**
   * App.tsx에서 setCameraFromSnapshot({pos,target}) 형태로 호출하는 것으로 보입니다.
   * - EngineSnapshot(World) 형태도 받아서 처리
   * - {pos,target} 또는 {camera:{pos,target}} 형태도 처리
   */
  public setCameraFromSnapshot(snapshot: any) {
    if (!snapshot || !this.camera) return;

    // 형태 A: { pos, target }
    if (snapshot.pos && snapshot.target) {
      const p = vec3FromAny(snapshot.pos);
      const t = vec3FromAny(snapshot.target);
      if (p && t) {
        this.camera.position.copy(p);
        this.camera.lookAt(t);
        this.camera.updateMatrixWorld();
        return;
      }
    }

    // 형태 B: { camera: { pos, target } }
    if (snapshot.camera && snapshot.camera.pos && snapshot.camera.target) {
      const p = vec3FromAny(snapshot.camera.pos);
      const t = vec3FromAny(snapshot.camera.target);
      if (p && t) {
        this.camera.position.copy(p);
        this.camera.lookAt(t);
        this.camera.updateMatrixWorld();
      }
    }

    // 형태 C: { camera: { position:[...], quaternion:[...], fov, near, far }, preset, exposure }
    if (snapshot.camera && snapshot.camera.position && snapshot.camera.quaternion) {
      const c = snapshot.camera;
      const pos = vec3FromAny(c.position);
      if (pos) this.camera.position.copy(pos);

      if (Array.isArray(c.quaternion) && c.quaternion.length >= 4) {
        this.camera.quaternion.set(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3]);
      }

      if (typeof c.fov === "number") this.camera.fov = c.fov;
      if (typeof c.near === "number") this.camera.near = c.near;
      if (typeof c.far === "number") this.camera.far = c.far;

      this.camera.updateProjectionMatrix();

      if (typeof snapshot.exposure === "number") this.setExposure(snapshot.exposure);
      if (snapshot.preset) this.applyPreset(snapshot.preset as GraphicsPreset);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render controls
  // ───────────────────────────────────────────────────────────────────────────

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
    if (this.bloomPass) {
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
  }

  /**
   * Floating origin shift: 외부 시뮬레이션에서 rebase할 때 호출 가능
   */
  public applyFloatingOriginShift(shift: THREE.Vector3) {
    if (!this.scene || !this.camera) return;

    this.floatingOrigin.add(shift);

    this.scene.traverse((o) => {
      if (o === this.camera) return;
      o.position.add(shift);
    });
    this.camera.position.add(shift);
  }

  public updateNearFar(nearHint: number, farHint: number) {
    if (!this.camera) return;
    const n = clamp(nearHint, 0.01, 5000);
    const f = clamp(farHint, 100, 5e8);

    this.camera.near = lerp(this.camera.near, n, 0.25);
    this.camera.far = lerp(this.camera.far, f, 0.25);
    this.camera.updateProjectionMatrix();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────────

  private initThree() {
    if (!this.canvas) throw new Error("ThreeRoot: canvas is not attached");

    const canvas = this.canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.exposure;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const aspect = (canvas.clientWidth || 1) / Math.max(1, canvas.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1e7);
    this.camera.position.set(0, 10, 30);
    this.camera.lookAt(0, 0, 0);

    // minimal lights
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x111122, 0.15);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, 30, 20);
    dir.castShadow = false;
    this.scene.add(dir);

    // composer
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth || 1, canvas.clientHeight || 1),
      0.35,
      0.6,
      0.88
    );
    this.composer.addPass(this.bloomPass);

    // final pass placeholder (lens pass 삽입 위치)
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

    // apply preset once everything exists
    this.applyPreset(this.preset);
  }

  private resizeToHost() {
    if (!this.canvas || !this.renderer || !this.composer || !this.camera) return;

    const w = this.host?.clientWidth ?? this.canvas.clientWidth ?? 1;
    const h = this.host?.clientHeight ?? this.canvas.clientHeight ?? 1;

    const width = Math.max(1, w);
    const height = Math.max(1, h);

    // setSize with updateStyle=false because CSS controls it
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    if (this.bloomPass) this.bloomPass.setSize(width, height);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (!this.started) return;

    const t = nowSec();
    const dt = Math.min(0.1, Math.max(1e-6, t - this.lastT));
    this.lastT = t;
    this.time += dt;

    const instFps = 1 / dt;
    this.fps = lerp(this.fps, instFps, 0.12);

    // instanced cache
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

  private teardownHost() {
    if (this.resizeObs) {
      try {
        this.resizeObs.disconnect();
      } catch {
        // ignore
      }
      this.resizeObs = null;
    }

    // if we created a canvas inside host, remove it
    if (this.host && this.canvas && this.canvas.parentElement === this.host) {
      try {
        this.host.removeChild(this.canvas);
      } catch {
        // ignore
      }
    }

    this.host = null;
    this.canvas = null;
  }
}

export default ThreeRoot;
