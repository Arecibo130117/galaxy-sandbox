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
function num(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function isCanvas(el: Element): el is HTMLCanvasElement {
  return el instanceof HTMLCanvasElement;
}
function isHTMLElement(el: any): el is HTMLElement {
  return el && typeof el === "object" && typeof el.tagName === "string";
}
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
function vec3FromBody(b: any): THREE.Vector3 {
  // position may be {x,y,z} or [x,y,z]
  const p = b?.position ?? b?.pos ?? b?.p;
  if (Array.isArray(p) && p.length >= 3) return new THREE.Vector3(num(p[0]), num(p[1]), num(p[2]));
  if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.z === "number") {
    return new THREE.Vector3(num(p.x), num(p.y), num(p.z));
  }
  return new THREE.Vector3(0, 0, 0);
}
function colorFromBody(b: any): THREE.Color {
  // accept hex string or rgb array or fallback
  const c = b?.color;
  if (typeof c === "string") {
    try {
      return new THREE.Color(c);
    } catch {
      return new THREE.Color(0.8, 0.85, 1.0);
    }
  }
  if (Array.isArray(c) && c.length >= 3) return new THREE.Color(num(c[0], 1), num(c[1], 1), num(c[2], 1));
  // simple by name/type
  const name = String(b?.name ?? "").toLowerCase();
  const type = String(b?.type ?? "").toLowerCase();
  if (type === "sun" || name === "sun") return new THREE.Color(1.0, 0.85, 0.55);
  if (name.includes("earth")) return new THREE.Color(0.45, 0.65, 1.0);
  if (name.includes("mars")) return new THREE.Color(0.9, 0.45, 0.25);
  if (name.includes("jupiter")) return new THREE.Color(0.9, 0.8, 0.65);
  if (name.includes("saturn")) return new THREE.Color(0.95, 0.9, 0.75);
  if (name.includes("uranus")) return new THREE.Color(0.65, 0.85, 0.95);
  if (name.includes("neptune")) return new THREE.Color(0.45, 0.65, 0.95);
  if (name.includes("moon")) return new THREE.Color(0.85, 0.85, 0.9);
  return new THREE.Color(0.82, 0.86, 1.0);
}

// ─────────────────────────────────────────────────────────────────────────────
// ThreeRoot
// ─────────────────────────────────────────────────────────────────────────────

export class ThreeRoot {
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;

  private composer!: EffectComposer;
  private renderPass!: RenderPass;
  private bloomPass!: UnrealBloomPass;
  private finalPass!: ShaderPass;

  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private started = false;
  private rafId: number | null = null;
  private resizeObs: ResizeObserver | null = null;

  private preset: GraphicsPreset = "High";
  private postprocessEnabled = true;
  private bloomEnabled = true;
  private exposure = 1.0;

  private lastT = 0;
  private time = 0;
  private fps = 60;

  private instancedCached = 0;
  private instancedEveryNFrames = 10;

  private worldChangedCbs = new Set<() => void>();
  private runtimeSink: ((rt: ThreeRuntime) => void) | null = null;

  // store integration
  private store: any = null; // if arg has getState/subscribe
  private lastWorldSnapshot: any = null;

  // scene content
  private worldGroup = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private ringGroup = new THREE.Group();
  private starfield: THREE.Points | null = null;

  private bodyMeshes = new Map<string, THREE.Mesh>();
  private ringMeshes = new Map<string, THREE.Mesh>();

  // cached geometries
  private sphereGeo = new THREE.SphereGeometry(1, 64, 64);

  // floating origin bookkeeping
  private floatingOrigin = new THREE.Vector3(0, 0, 0);

  constructor() {}

  public attach(target: HTMLElement | HTMLCanvasElement) {
    if (!isHTMLElement(target)) throw new Error("ThreeRoot.attach(target): target must be HTMLElement/HTMLCanvasElement");

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

    this.initThree();

    this.resizeObs = new ResizeObserver(() => this.resizeToHost());
    if (this.host) this.resizeObs.observe(this.host);
    else if (this.canvas) this.resizeObs.observe(this.canvas);

    this.resizeToHost();

    this.lastT = nowSec();
    this.emitWorldChanged();
  }

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

  public onWorldChanged(cb?: () => void) {
    if (typeof cb === "function") {
      this.worldChangedCbs.add(cb);
      return () => this.worldChangedCbs.delete(cb);
    }
    this.emitWorldChanged();
    return undefined;
  }

  /**
   * App.tsx가 syncFromStore(arg) 호출.
   * - arg가 store(getState/subscribe)면 저장하고, 매 프레임 getState로 월드를 렌더링
   * - 아니면 스냅샷 객체로 저장
   */
  public syncFromStore(storeOrSnapshot?: any) {
    if (storeOrSnapshot == null) return;

    if (typeof storeOrSnapshot.getState === "function") {
      this.store = storeOrSnapshot;
      try {
        this.lastWorldSnapshot = this.store.getState();
      } catch {
        // ignore
      }
      return;
    }

    this.lastWorldSnapshot = storeOrSnapshot;
  }

  public setRuntimeSink(cb: (rt: ThreeRuntime) => void) {
    this.runtimeSink = cb;
  }

  public makeSnapshot(): any {
    // Save/Load가 WorldSnapshot을 기대하므로 가능한 한 “마지막 상태”를 반환
    if (this.store && typeof this.store.getState === "function") {
      try {
        return this.store.getState();
      } catch {
        // ignore
      }
    }
    if (this.lastWorldSnapshot != null) return this.lastWorldSnapshot;

    // fallback minimal camera snapshot
    const p = this.camera?.position ?? new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera?.quaternion ?? new THREE.Quaternion());
    const target = p.clone().add(dir.multiplyScalar(10));
    return { camera: { pos: { x: p.x, y: p.y, z: p.z }, target: { x: target.x, y: target.y, z: target.z } } };
  }

  public setCameraFromSnapshot(snapshot: any) {
    if (!snapshot || !this.camera) return;

    // {pos,target}
    if (snapshot.pos && snapshot.target) {
      const p = snapshot.pos;
      const t = snapshot.target;
      const pv = vec3FromBody({ position: p });
      const tv = vec3FromBody({ position: t });
      this.camera.position.copy(pv);
      this.camera.lookAt(tv);
      this.camera.updateMatrixWorld();
      return;
    }

    // {camera:{pos,target}}
    if (snapshot.camera?.pos && snapshot.camera?.target) {
      const pv = vec3FromBody({ position: snapshot.camera.pos });
      const tv = vec3FromBody({ position: snapshot.camera.target });
      this.camera.position.copy(pv);
      this.camera.lookAt(tv);
      this.camera.updateMatrixWorld();
      return;
    }
  }

  // render controls
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

    if (preset === "Low") this.renderer.setPixelRatio(Math.min(1.0, window.devicePixelRatio || 1));
    else if (preset === "Medium") this.renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    else if (preset === "High") this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    else this.renderer.setPixelRatio(Math.min(2.0, window.devicePixelRatio || 1));

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

  // floating origin shift (optional external)
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
    if (!this.canvas) throw new Error("ThreeRoot: canvas not attached");

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
    this.camera.position.set(0, 8, 22);
    this.camera.lookAt(0, 0, 0);

    // Lights
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x111122, 0.25);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(50, 30, 20);
    dir.castShadow = false;
    this.scene.add(dir);

    // Groups
    this.worldGroup = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.ringGroup = new THREE.Group();
    this.worldGroup.add(this.bodyGroup);
    this.worldGroup.add(this.ringGroup);
    this.scene.add(this.worldGroup);

    // Starfield (always visible -> draw calls > 0)
    this.starfield = this.createStarfield();
    this.scene.add(this.starfield);

    // Composer
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

    this.finalPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }
      `,
    });
    this.composer.addPass(this.finalPass);

    this.applyPreset(this.preset);
  }

  private createStarfield() {
    const count = 8000;
    const radius = 20000;

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // random direction on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      const r = radius * (0.6 + 0.4 * Math.random());
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      const t = Math.random();
      c.setHSL(0.58 - 0.08 * t, 0.25 + 0.2 * t, 0.75 + 0.2 * Math.random());
      col[i * 3 + 0] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));

    const m = new THREE.PointsMaterial({
      size: 2.0,
      sizeAttenuation: true,
      vertexColors: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });

    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  private resizeToHost() {
    if (!this.canvas || !this.renderer || !this.composer || !this.camera) return;
    const w = this.host?.clientWidth ?? this.canvas.clientWidth ?? 1;
    const h = this.host?.clientHeight ?? this.canvas.clientHeight ?? 1;
    const width = Math.max(1, w);
    const height = Math.max(1, h);

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

    // ✅ 핵심: store/state -> meshes 업데이트 (이게 없으면 화면이 '텅 빈' 상태)
    const state = this.store?.getState?.() ?? this.lastWorldSnapshot;
    this.applyWorldStateToScene(state);

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

  private applyWorldStateToScene(state: any) {
    if (!state || !this.scene) return;

    // bodies list
    const bodies: any[] = state.bodies ?? state.world?.bodies ?? [];
    if (!Array.isArray(bodies)) return;

    // scales (UI 슬라이더를 최대한 따라가기)
    const distanceScale = Math.max(1e-6, num(state.scales?.distance ?? state.distanceScale, 1));
    const radiusScale = Math.max(1e-6, num(state.scales?.radius ?? state.radiusScale, 1));

    // remove missing
    const alive = new Set<string>();
    for (const b of bodies) {
      if (!b) continue;
      const id = String(b.id ?? b.name ?? "");
      if (!id) continue;
      if (b.enabled === false) continue;
      alive.add(id);
    }

    for (const [id, m] of this.bodyMeshes) {
      if (!alive.has(id)) {
        this.bodyGroup.remove(m);
        m.geometry.dispose?.();
        (m.material as any)?.dispose?.();
        this.bodyMeshes.delete(id);
      }
    }
    for (const [id, m] of this.ringMeshes) {
      if (!alive.has(id)) {
        this.ringGroup.remove(m);
        m.geometry.dispose?.();
        (m.material as any)?.dispose?.();
        this.ringMeshes.delete(id);
      }
    }

    // create/update
    for (const b of bodies) {
      if (!b || b.enabled === false) continue;
      const id = String(b.id ?? b.name ?? "");
      if (!id) continue;

      const name = String(b.name ?? id);
      const type = String(b.type ?? "").toLowerCase();

      const baseRadius = Math.max(0.001, num(b.radius ?? b.r ?? b.size, 1));
      const radius = baseRadius * radiusScale;

      const pos0 = vec3FromBody(b).multiplyScalar(distanceScale);

      // create mesh if missing
      let mesh = this.bodyMeshes.get(id);
      if (!mesh) {
        const col = colorFromBody(b);

        const isSun = type === "sun" || name.toLowerCase() === "sun";
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: isSun ? 0.25 : 0.85,
          metalness: isSun ? 0.0 : 0.05,
          emissive: isSun ? col.clone().multiplyScalar(0.8) : new THREE.Color(0x000000),
          emissiveIntensity: isSun ? 1.0 : 0.0,
        });

        mesh = new THREE.Mesh(this.sphereGeo, mat);
        mesh.name = `body:${id}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        this.bodyGroup.add(mesh);
        this.bodyMeshes.set(id, mesh);
      }

      mesh.position.copy(pos0);
      mesh.scale.setScalar(radius);

      // (optional) simple axial tilt/rotation
      const tilt = num(b.axialTilt ?? b.tilt, 0);
      const spin = num(b.spin ?? b.rotationSpeed, 0);
      mesh.rotation.z = tilt;
      mesh.rotation.y += spin * 0.01; // cheap animate

      // saturn ring (very lightweight)
      const wantsRing = !!b.hasRing || name.toLowerCase().includes("saturn");
      if (wantsRing) {
        let ring = this.ringMeshes.get(id);
        if (!ring) {
          const inner = radius * 1.25;
          const outer = radius * 2.2;

          const geo = new THREE.RingGeometry(inner, outer, 128, 1);
          // ring UV-ish noise via vertex color (no texture)
          const cols = new Float32Array(geo.attributes.position.count * 3);
          for (let i = 0; i < geo.attributes.position.count; i++) {
            const px = geo.attributes.position.getX(i);
            const py = geo.attributes.position.getY(i);
            const rr = Math.sqrt(px * px + py * py);
            const band = Math.sin(rr * 12.0) * 0.5 + 0.5;
            const n = band * (0.6 + 0.4 * Math.random());
            cols[i * 3 + 0] = 0.9 * n;
            cols[i * 3 + 1] = 0.85 * n;
            cols[i * 3 + 2] = 0.75 * n;
          }
          geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));

          const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
            depthWrite: false,
          });

          ring = new THREE.Mesh(geo, mat);
          ring.name = `ring:${id}`;
          this.ringGroup.add(ring);
          this.ringMeshes.set(id, ring);
        }

        ring.position.copy(pos0);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = mesh.rotation.z;
      }
    }
  }

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
