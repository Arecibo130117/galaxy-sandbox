import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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
    if (anyO && anyO.isInstancedMesh) total += typeof anyO.count === "number" ? anyO.count : 0;
  });
  return total;
}
function vec3FromAny(v: any): THREE.Vector3 | null {
  if (!v) return null;
  if (Array.isArray(v) && v.length >= 3) return new THREE.Vector3(num(v[0]), num(v[1]), num(v[2]));
  if (typeof v.x === "number" && typeof v.y === "number" && typeof v.z === "number") {
    return new THREE.Vector3(num(v.x), num(v.y), num(v.z));
  }
  return null;
}
function vec3FromBody(b: any): THREE.Vector3 {
  const p = b?.position ?? b?.pos ?? b?.p;
  const v = vec3FromAny(p);
  return v ?? new THREE.Vector3(0, 0, 0);
}
function safeNormalize(v: THREE.Vector3) {
  const l = v.length();
  if (l > 1e-8) v.multiplyScalar(1 / l);
  return v;
}
function colorFromBody(b: any): THREE.Color {
  const c = b?.color;
  if (typeof c === "string") {
    try {
      return new THREE.Color(c);
    } catch {
      return new THREE.Color(0.82, 0.86, 1.0);
    }
  }
  if (Array.isArray(c) && c.length >= 3) return new THREE.Color(num(c[0], 1), num(c[1], 1), num(c[2], 1));
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
// types for minimal simulation
// ─────────────────────────────────────────────────────────────────────────────
type BodyInfo = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  pos: THREE.Vector3; // scaled
  radius: number; // scaled
  mass: number; // scaled (arbitrary)
  color: THREE.Color;
  hasRing: boolean;
};

type Asteroid = {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  mass: number;
  mat: 0 | 1 | 2; // rock/ice/iron
  ttl: number;
};

type ImpactFx = {
  t: number;
  dur: number;
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  energy: number;
  flash: THREE.Sprite;
  ring: THREE.Mesh;
};

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
  private flarePass!: ShaderPass;
  private finalPass!: ShaderPass;

  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private controls!: OrbitControls;

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
  private store: any = null;
  private lastWorldSnapshot: any = null;

  // scene groups
  private worldGroup = new THREE.Group();
  private bodyGroup = new THREE.Group();
  private ringGroup = new THREE.Group();
  private fxGroup = new THREE.Group();
  private starfield: THREE.Points | null = null;

  // meshes map
  private bodyMeshes = new Map<string, THREE.Mesh>();
  private ringMeshes = new Map<string, THREE.Mesh>();

  // geometries
  private sphereGeo = new THREE.SphereGeometry(1, 64, 64);

  // selection
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private selectedId: string | null = null;
  private trackingSelected = true;

  // input state
  private pointerDown = false;
  private pointerButton: number = 0;
  private shiftDown = false;
  private lastBrushSpawn = 0;

  // asteroids
  private asteroids: Asteroid[] = [];
  private asteroidMax = 6000;
  private asteroidGeom = new THREE.SphereGeometry(1, 12, 10);
  private asteroidMats: THREE.MeshStandardMaterial[] = [
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.55, 0.6), roughness: 0.95, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.75, 0.85, 0.95), roughness: 0.9, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.75, 0.75, 0.78), roughness: 0.6, metalness: 0.65 }),
  ];
  private asteroidMesh: THREE.InstancedMesh;
  private asteroidDummy = new THREE.Object3D();

  // impact FX
  private impacts: ImpactFx[] = [];
  private ringGeo = new THREE.RingGeometry(0.95, 1.0, 96, 1);

  // sim params
  private timeScale = 1;
  private paused = false;
  private stepOnce = false;

  // floating origin bookkeeping
  private floatingOrigin = new THREE.Vector3(0, 0, 0);

  // ───────────────────────────────────────────────────────────────────────────
  // Sun light + flare
  // ───────────────────────────────────────────────────────────────────────────
  private sunDirLight!: THREE.DirectionalLight;
  private sunPointLight!: THREE.PointLight;
  private sunTarget = new THREE.Object3D();

  private sunFound = false;
  private sunWorldPos = new THREE.Vector3();
  private sunRadius = 1;

  private sunIntensity = 2.5;     // scene lighting strength
  private flareIntensity = 0.9;   // flare strength

  constructor() {
    // pre-allocate asteroid pool
    this.asteroids = new Array(this.asteroidMax);
    for (let i = 0; i < this.asteroidMax; i++) {
      this.asteroids[i] = {
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        radius: 0.05,
        mass: 1,
        mat: 0,
        ttl: 0,
      };
    }
    // @ts-ignore
    this.asteroidMesh = null;
  }

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
      c.style.pointerEvents = "auto";
      this.host.appendChild(c);
      this.canvas = c;
    }

    // prevent RMB context menu blocking orbit
    this.canvas!.oncontextmenu = (e) => {
      e.preventDefault();
      return false;
    };

    this.initThree();
    this.bindInput();

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
    this.unbindInput();
    try {
      this.composer?.dispose();
      this.renderer?.dispose();
    } catch {}
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

  public syncFromStore(storeOrSnapshot?: any) {
    if (storeOrSnapshot == null) return;
    if (typeof storeOrSnapshot.getState === "function") {
      this.store = storeOrSnapshot;
      try {
        this.lastWorldSnapshot = this.store.getState();
      } catch {}
      return;
    }
    this.lastWorldSnapshot = storeOrSnapshot;
  }

  public setRuntimeSink(cb: (rt: ThreeRuntime) => void) {
    this.runtimeSink = cb;
  }

  public makeSnapshot(): any {
    if (this.store?.getState) {
      try {
        return this.store.getState();
      } catch {}
    }
    if (this.lastWorldSnapshot != null) return this.lastWorldSnapshot;
    const p = this.camera?.position ?? new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera?.quaternion ?? new THREE.Quaternion());
    const target = p.clone().add(dir.multiplyScalar(10));
    return { camera: { pos: { x: p.x, y: p.y, z: p.z }, target: { x: target.x, y: target.y, z: target.z } } };
  }

  public setCameraFromSnapshot(snapshot: any) {
    if (!snapshot || !this.camera) return;
    if (snapshot.pos && snapshot.target) {
      const pv = vec3FromAny(snapshot.pos);
      const tv = vec3FromAny(snapshot.target);
      if (pv && tv) {
        this.camera.position.copy(pv);
        this.controls.target.copy(tv);
        this.camera.lookAt(tv);
        this.controls.update();
      }
      return;
    }
    if (snapshot.camera?.pos && snapshot.camera?.target) {
      const pv = vec3FromAny(snapshot.camera.pos);
      const tv = vec3FromAny(snapshot.camera.target);
      if (pv && tv) {
        this.camera.position.copy(pv);
        this.controls.target.copy(tv);
        this.camera.lookAt(tv);
        this.controls.update();
      }
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
    this.controls.target.add(shift);
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
  // init + input
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

    // OrbitControls (RMB rotate, LMB pan, wheel zoom)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.75;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 5e7;

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // Lights (ambient-ish)
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x111122, 0.22);
    this.scene.add(hemi);

    // a subtle fill directional (NOT the sun)
    const fill = new THREE.DirectionalLight(0xffffff, 0.18);
    fill.position.set(-40, 25, -20);
    fill.castShadow = false;
    this.scene.add(fill);

    // --- Sun-directed light (main sunlight) ---
    this.scene.add(this.sunTarget);

    this.sunDirLight = new THREE.DirectionalLight(0xffffff, 0.0);
    this.sunDirLight.castShadow = false;
    this.sunDirLight.target = this.sunTarget;
    this.scene.add(this.sunDirLight);

    // --- Sun point light (subtle local punch) ---
    this.sunPointLight = new THREE.PointLight(0xfff1dc, 0.0, 0, 2.0);
    this.sunPointLight.castShadow = false;
    this.scene.add(this.sunPointLight);

    // Groups
    this.worldGroup = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.ringGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.worldGroup.add(this.bodyGroup);
    this.worldGroup.add(this.ringGroup);
    this.scene.add(this.worldGroup);
    this.scene.add(this.fxGroup);

    // Starfield (always visible)
    this.starfield = this.createStarfield();
    this.scene.add(this.starfield);

    // Asteroid InstancedMesh
    this.asteroidMesh = new THREE.InstancedMesh(this.asteroidGeom, this.asteroidMats[0], this.asteroidMax);
    this.asteroidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.asteroidMesh.frustumCulled = false;
    this.asteroidMesh.name = "asteroids";
    this.scene.add(this.asteroidMesh);

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

    // --- Procedural Lens Flare (no textures) ---
    this.flarePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) }, // 0..1
        uIntensity: { value: 0.0 },
        uAspect: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uSunUv;
        uniform float uIntensity;
        uniform float uAspect;
        varying vec2 vUv;

        float sat(float x){ return clamp(x,0.0,1.0); }

        vec3 tint(float t){
          return vec3(
            0.9 + 0.2*sin(6.2831*(t+0.00)),
            0.8 + 0.2*sin(6.2831*(t+0.33)),
            0.7 + 0.2*sin(6.2831*(t+0.66))
          );
        }

        float gauss(float d, float k){
          return exp(-d*d*k);
        }

        void main(){
          vec4 base = texture2D(tDiffuse, vUv);

          float I = uIntensity;
          if(I <= 0.0001){
            gl_FragColor = base;
            return;
          }

          vec2 uv = vUv;
          vec2 center = vec2(0.5, 0.5);

          vec2 d0 = uv - uSunUv;
          d0.x *= uAspect;
          float r = length(d0);

          float halo = gauss(r, 60.0) * 0.9 + gauss(r, 10.0) * 0.25;

          float ang = atan(d0.y, d0.x);
          float streak = pow(abs(sin(ang*6.0)), 18.0) * gauss(r, 140.0);
          streak += pow(abs(sin(ang*2.0)), 14.0) * gauss(r, 60.0);

          vec2 axis = center - uSunUv;
          vec3 ghosts = vec3(0.0);
          for(int i=0;i<4;i++){
            float fi = float(i) / 3.0;
            float k = mix(0.35, 1.65, fi);
            vec2 gp = center + axis * k;

            vec2 dg = uv - gp;
            dg.x *= uAspect;
            float rg = length(dg);

            float g = gauss(rg, mix(55.0, 18.0, fi));
            ghosts += tint(fi*0.9 + 0.1) * g * mix(0.55, 0.25, fi);
          }

          vec2 dv = uv - center;
          dv.x *= uAspect;
          float vign = 1.0 - 0.35*sat(length(dv));

          vec3 flare = vec3(0.0);
          flare += vec3(1.0, 0.93, 0.82) * halo;
          flare += vec3(0.85, 0.9, 1.0) * streak * 0.9;
          flare += ghosts;

          flare *= I * vign;

          vec3 outCol = base.rgb + flare;
          gl_FragColor = vec4(outCol, base.a);
        }
      `,
    });
    this.composer.addPass(this.flarePass);

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
    // ensure output
    this.finalPass.renderToScreen = true;
    this.composer.addPass(this.finalPass);

    this.applyPreset(this.preset);
  }

  private bindInput() {
    const el = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDown = true;
      this.pointerButton = e.button;
      this.shiftDown = e.shiftKey;

      // LMB + no shift => selection
      if (e.button === 0 && !e.shiftKey) {
        this.pickAtClient(e.clientX, e.clientY);
      }
    };

    const onPointerUp = () => {
      this.pointerDown = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      this.shiftDown = e.shiftKey;

      // Shift+LMB brush spawn
      if (this.pointerDown && this.pointerButton === 0 && this.shiftDown) {
        this.brushSpawn();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") this.shiftDown = true;
      if (e.key.toLowerCase() === "p") this.paused = !this.paused;
      if (e.key.toLowerCase() === "o") this.stepOnce = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") this.shiftDown = false;
    };

    (this as any)._evt = { onPointerDown, onPointerUp, onPointerMove, onKeyDown, onKeyUp };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointermove", onPointerMove);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }

  private unbindInput() {
    const el = this.renderer?.domElement;
    const evt = (this as any)._evt;
    if (!el || !evt) return;

    el.removeEventListener("pointerdown", evt.onPointerDown);
    window.removeEventListener("pointerup", evt.onPointerUp);
    el.removeEventListener("pointermove", evt.onPointerMove);

    window.removeEventListener("keydown", evt.onKeyDown);
    window.removeEventListener("keyup", evt.onKeyUp);

    (this as any)._evt = null;
  }

  private pickAtClient(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerNdc.set(x, y);

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const candidates: THREE.Object3D[] = [];
    for (const m of this.bodyMeshes.values()) candidates.push(m);

    const hits = this.raycaster.intersectObjects(candidates, false);
    if (hits.length > 0) {
      const obj = hits[0].object as THREE.Mesh;
      const name = obj.name; // "body:<id>"
      const id = name.startsWith("body:") ? name.slice(5) : null;
      if (id) {
        this.selectedId = id;
        this.trackingSelected = true;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // render loop
  // ───────────────────────────────────────────────────────────────────────────
  private loop = () => {
    if (!this.started) return;

    const t = nowSec();
    const dtRaw = Math.min(0.1, Math.max(1e-6, t - this.lastT));
    this.lastT = t;

    const instFps = 1 / dtRaw;
    this.fps = lerp(this.fps, instFps, 0.12);

    // state read
    const state = this.store?.getState?.() ?? this.lastWorldSnapshot;
    this.applyCommonSettings(state);

    // time step
    let dt = dtRaw * this.timeScale;
    if (this.paused) dt = 0;
    if (this.stepOnce) {
      dt = dtRaw * this.timeScale;
      this.stepOnce = false;
    }
    this.time += dt;

    // update world meshes
    const bodies = this.applyWorldStateToScene(state);

    // update sun light + flare uniforms
    this.updateSunFlareUniforms();

    // track selected -> controls target
    if (this.trackingSelected && this.selectedId && this.bodyMeshes.has(this.selectedId)) {
      const m = this.bodyMeshes.get(this.selectedId)!;
      this.controls.target.lerp(m.position, 0.18);
    }

    // asteroid simulation + collisions
    if (dt > 0) {
      this.updateAsteroids(dt, bodies);
      this.updateImpacts(dt);
    }

    // controls update
    this.controls.update();

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
        dt: dtRaw,
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

  private applyCommonSettings(state: any) {
    // time flow
    this.timeScale = Math.max(0.0001, num(state?.timeScale ?? state?.time?.scale ?? state?.sim?.timeScale, 1));

    // graphics toggles
    const post = state?.settings?.postprocess;
    if (typeof post === "boolean") this.postprocessEnabled = post;

    const bloom = state?.settings?.bloom;
    if (typeof bloom === "boolean") this.bloomEnabled = bloom;

    const ex = state?.settings?.exposure;
    if (typeof ex === "number") this.setExposure(ex);

    // Sun/flare controls if present in store
    const sI = state?.settings?.sunIntensity;
    if (typeof sI === "number") this.sunIntensity = Math.max(0, sI);

    const fI = state?.settings?.flareIntensity;
    if (typeof fI === "number") this.flareIntensity = Math.max(0, fI);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sun flare uniforms + lighting: "태양에서 빛이 내게"
  // ───────────────────────────────────────────────────────────────────────────
  private updateSunFlareUniforms() {
    if (!this.flarePass || !this.sunDirLight || !this.sunPointLight) return;

    if (!this.sunFound) {
      this.flarePass.uniforms.uIntensity.value = 0.0;
      this.sunDirLight.intensity = 0.0;
      this.sunPointLight.intensity = 0.0;
      return;
    }

    // "빛이 내게": light direction = from sun towards camera (not just target)
    this.sunDirLight.position.copy(this.sunWorldPos);
    this.sunPointLight.position.copy(this.sunWorldPos);
    this.sunTarget.position.copy(this.camera.position);

    // project sun to screen (0..1)
    const p = this.sunWorldPos.clone().project(this.camera);
    const sunUv = new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);

    // visibility: in front + roughly on-screen + facing
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);

    const camFwd = new THREE.Vector3();
    this.camera.getWorldDirection(camFwd);

    const toSun = this.sunWorldPos.clone().sub(camPos);
    safeNormalize(toSun);

    const facing = Math.max(0, camFwd.dot(toSun));
    const onscreen =
      sunUv.x >= -0.2 && sunUv.x <= 1.2 &&
      sunUv.y >= -0.2 && sunUv.y <= 1.2 &&
      p.z > -1.0 && p.z < 1.0;

    const vis = onscreen ? facing : 0;

    // flare intensity (also scales with apparent size a bit)
    const sizeBoost = clamp(this.sunRadius * 0.15, 0.2, 1.2);
    const I = this.flareIntensity * vis * sizeBoost;

    const w = this.renderer.domElement.width;
    const h = Math.max(1, this.renderer.domElement.height);
    const aspect = w / h;

    this.flarePass.uniforms.uSunUv.value.copy(sunUv);
    this.flarePass.uniforms.uAspect.value = aspect;
    this.flarePass.uniforms.uIntensity.value = I;

    // scene lighting
    this.sunDirLight.intensity = this.sunIntensity * (0.35 + 0.65 * vis);
    this.sunPointLight.intensity = this.sunIntensity * 0.14 * vis; // subtle
  }

  // ───────────────────────────────────────────────────────────────────────────
  // asteroids: spawn + update + collision
  // ───────────────────────────────────────────────────────────────────────────
  private brushSpawn() {
    const now = performance.now();
    const minIntervalMs = 24; // ~40Hz brush
    if (now - this.lastBrushSpawn < minIntervalMs) return;
    this.lastBrushSpawn = now;

    const count = 6;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    safeNormalize(forward);

    const origin = this.camera.position.clone().add(forward.clone().multiplyScalar(2.0));

    for (let i = 0; i < count; i++) {
      const spread = 0.06;
      const dir = forward.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread
        )
      );
      safeNormalize(dir);

      const speed = 12 + 18 * Math.random();
      const radius = 0.04 + 0.08 * Math.random();
      const mass = 1.0 + 8.0 * Math.random();
      const mat = (Math.random() < 0.65 ? 0 : Math.random() < 0.85 ? 1 : 2) as 0 | 1 | 2;

      this.spawnAsteroid(origin, dir.multiplyScalar(speed), radius, mass, mat);
    }
  }

  private spawnAsteroid(pos: THREE.Vector3, vel: THREE.Vector3, radius: number, mass: number, mat: 0 | 1 | 2) {
    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      if (!a.alive) {
        a.alive = true;
        a.pos.copy(pos);
        a.vel.copy(vel);
        a.radius = radius;
        a.mass = mass;
        a.mat = mat;
        a.ttl = 90;
        return;
      }
    }
  }

  private updateAsteroids(dt: number, bodies: BodyInfo[]) {
    const G = 0.08;

    let instIdx = 0;

    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      if (!a.alive) continue;

      a.ttl -= dt;
      if (a.ttl <= 0) {
        a.alive = false;
        continue;
      }

      // best influencer (top-1)
      let best: BodyInfo | null = null;
      let bestAcc = 0;

      for (const b of bodies) {
        if (!b.enabled) continue;
        const to = b.pos.clone().sub(a.pos);
        const r2 = Math.max(1e-6, to.lengthSq());
        const acc = (G * b.mass) / r2;
        if (acc > bestAcc) {
          bestAcc = acc;
          best = b;
        }
      }

      if (best) {
        const to = best.pos.clone().sub(a.pos);
        const r2 = Math.max(1e-6, to.lengthSq());
        safeNormalize(to);
        const acc = (G * best.mass) / r2;
        a.vel.addScaledVector(to, acc * dt);
      }

      a.pos.addScaledVector(a.vel, dt);

      // collision with bodies
      let hitBody: BodyInfo | null = null;
      for (const b of bodies) {
        const r = b.radius + a.radius;
        if (a.pos.distanceToSquared(b.pos) <= r * r) {
          hitBody = b;
          break;
        }
      }

      if (hitBody) {
        const v2 = a.vel.lengthSq();
        const energy = 0.5 * a.mass * v2;

        const normal = a.pos.clone().sub(hitBody.pos);
        safeNormalize(normal);

        this.spawnImpact(hitBody.pos.clone().add(normal.clone().multiplyScalar(hitBody.radius)), normal, energy);
        a.alive = false;
        continue;
      }

      // instanced render
      this.asteroidDummy.position.copy(a.pos);
      this.asteroidDummy.scale.setScalar(a.radius);
      this.asteroidDummy.updateMatrix();

      const col = a.mat === 0
        ? new THREE.Color(0.7, 0.7, 0.75)
        : a.mat === 1
          ? new THREE.Color(0.85, 0.92, 1.0)
          : new THREE.Color(0.85, 0.85, 0.88);

      this.asteroidMesh.setMatrixAt(instIdx, this.asteroidDummy.matrix);

      if (!this.asteroidMesh.instanceColor) {
        const arr = new Float32Array(this.asteroidMax * 3);
        this.asteroidMesh.instanceColor = new THREE.InstancedBufferAttribute(arr, 3);
      }
      this.asteroidMesh.instanceColor!.setXYZ(instIdx, col.r, col.g, col.b);

      instIdx++;
      if (instIdx >= this.asteroidMax) break;
    }

    this.asteroidMesh.count = instIdx;
    this.asteroidMesh.instanceMatrix.needsUpdate = true;
    if (this.asteroidMesh.instanceColor) this.asteroidMesh.instanceColor.needsUpdate = true;
  }

  private spawnImpact(pos: THREE.Vector3, normal: THREE.Vector3, energy: number) {
    const spriteMat = new THREE.SpriteMaterial({
      color: new THREE.Color(1, 1, 1),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Sprite(spriteMat);
    flash.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.15)));
    const s = 0.6 + Math.log10(energy + 1) * 0.35;
    flash.scale.setScalar(clamp(s, 0.35, 3.5));
    this.fxGroup.add(flash);

    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.9, 0.95, 1.0),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.copy(pos.clone().add(normal.clone().multiplyScalar(0.02)));
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, normal.clone());
    ring.quaternion.copy(q);
    ring.scale.setScalar(0.001);
    this.fxGroup.add(ring);

    this.impacts.push({
      t: 0,
      dur: clamp(0.55 + Math.log10(energy + 1) * 0.18, 0.45, 1.2),
      pos,
      normal: normal.clone(),
      energy,
      flash,
      ring,
    });

    if (this.bloomPass) {
      this.bloomPass.strength = clamp(this.bloomPass.strength + 0.06, 0.18, 0.55);
    }
  }

  private updateImpacts(dt: number) {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const fx = this.impacts[i];
      fx.t += dt;
      const u = clamp(fx.t / fx.dur, 0, 1);

      const flashOp = (1 - u) * (1 - u);
      (fx.flash.material as THREE.SpriteMaterial).opacity = flashOp;
      fx.flash.scale.setScalar((0.6 + Math.log10(fx.energy + 1) * 0.35) * (1 + 0.6 * u));

      const ringScale = 0.12 + (0.9 + Math.log10(fx.energy + 1) * 0.25) * u;
      fx.ring.scale.setScalar(ringScale);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.85;

      if (u >= 1) {
        this.fxGroup.remove(fx.flash);
        this.fxGroup.remove(fx.ring);
        (fx.flash.material as any).dispose?.();
        (fx.ring.material as any).dispose?.();
        this.impacts.splice(i, 1);
      }
    }

    if (this.bloomPass) {
      const base =
        this.preset === "Cinematic++" ? 0.38 :
        this.preset === "High" ? 0.34 :
        this.preset === "Medium" ? 0.26 : 0.18;
      this.bloomPass.strength = lerp(this.bloomPass.strength, base, 0.05);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // world -> scene meshes (planets + rings)  + return BodyInfo[]
  // ───────────────────────────────────────────────────────────────────────────
  private applyWorldStateToScene(state: any): BodyInfo[] {
    const bodiesRaw: any[] = state?.bodies ?? state?.world?.bodies ?? [];
    if (!Array.isArray(bodiesRaw)) return [];

    const distanceScale = Math.max(1e-6, num(state?.scales?.distance ?? state?.distanceScale, 1));
    const radiusScale = Math.max(1e-6, num(state?.scales?.radius ?? state?.radiusScale, 1));
    const massScale = Math.max(1e-6, num(state?.scales?.mass ?? state?.massScale, 1));

    // reset sun detection each frame
    this.sunFound = false;

    // remove missing
    const alive = new Set<string>();
    for (const b of bodiesRaw) {
      if (!b) continue;
      const id = String(b.id ?? b.name ?? "");
      if (!id) continue;
      if (b.enabled === false) continue;
      alive.add(id);
    }

    for (const [id, m] of this.bodyMeshes) {
      if (!alive.has(id)) {
        this.bodyGroup.remove(m);
        (m.material as any)?.dispose?.();
        this.bodyMeshes.delete(id);
      }
    }
    for (const [id, m] of this.ringMeshes) {
      if (!alive.has(id)) {
        this.ringGroup.remove(m);
        (m.material as any)?.dispose?.();
        this.ringMeshes.delete(id);
      }
    }

    const infos: BodyInfo[] = [];

    for (const b of bodiesRaw) {
      if (!b || b.enabled === false) continue;
      const id = String(b.id ?? b.name ?? "");
      if (!id) continue;

      const name = String(b.name ?? id);
      const type = String(b.type ?? "").toLowerCase();

      const baseRadius = Math.max(0.001, num(b.radius ?? b.r ?? b.size, 1));
      const radius = baseRadius * radiusScale;

      const pos = vec3FromBody(b).multiplyScalar(distanceScale);

      const baseMass = Math.max(0.001, num(b.mass ?? b.m ?? 1, 1));
      const mass = baseMass * massScale;

      let mesh = this.bodyMeshes.get(id);
      if (!mesh) {
        const col = colorFromBody(b);
        const isSun = type === "sun" || name.toLowerCase() === "sun";
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          roughness: isSun ? 0.25 : 0.85,
          metalness: isSun ? 0.0 : 0.05,
          emissive: isSun ? col.clone().multiplyScalar(0.95) : new THREE.Color(0x000000),
          emissiveIntensity: isSun ? 1.15 : 0.0,
        });
        mesh = new THREE.Mesh(this.sphereGeo, mat);
        mesh.name = `body:${id}`;
        this.bodyGroup.add(mesh);
        this.bodyMeshes.set(id, mesh);
      }

      mesh.position.copy(pos);
      mesh.scale.setScalar(radius);

      const isSun = type === "sun" || name.toLowerCase() === "sun";
      if (isSun) {
        this.sunFound = true;
        this.sunWorldPos.copy(pos);
        this.sunRadius = radius;
      }

      // highlight selection
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isSel = this.selectedId === id;
      mat.emissiveIntensity = (isSun ? 1.15 : 0.0) + (isSel ? 0.45 : 0.0);

      // rings
      const wantsRing = !!b.hasRing || name.toLowerCase().includes("saturn");
      if (wantsRing) {
        let ring = this.ringMeshes.get(id);
        if (!ring) {
          const inner = radius * 1.25;
          const outer = radius * 2.2;
          const geo = new THREE.RingGeometry(inner, outer, 128, 1);

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

        ring.position.copy(pos);
        ring.rotation.x = Math.PI / 2;
      }

      infos.push({
        id,
        name,
        type,
        enabled: true,
        pos: pos.clone(),
        radius,
        mass,
        color: colorFromBody(b),
        hasRing: wantsRing,
      });
    }

    if (!this.selectedId && infos.length > 0) {
      const sun = infos.find((x) => x.type === "sun" || x.name.toLowerCase() === "sun");
      if (sun) {
        this.selectedId = sun.id;
        this.controls.target.copy(sun.pos);
      }
    }

    return infos;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // visuals
  // ───────────────────────────────────────────────────────────────────────────
  private createStarfield() {
    const count = 8000;
    const radius = 20000;

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
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

  private emitWorldChanged() {
    for (const cb of this.worldChangedCbs) cb();
  }

  private teardownHost() {
    if (this.resizeObs) {
      try {
        this.resizeObs.disconnect();
      } catch {}
      this.resizeObs = null;
    }

    if (this.host && this.canvas && this.canvas.parentElement === this.host) {
      try {
        this.host.removeChild(this.canvas);
      } catch {}
    }

    this.host = null;
    this.canvas = null;
  }
}

export default ThreeRoot;
