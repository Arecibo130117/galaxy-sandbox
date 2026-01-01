import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type GraphicsPreset = "Low" | "Medium" | "High" | "Cinematic++";

type DebugStats = {
  fps: number;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  instanced: number;
  preset: GraphicsPreset;
};

function nowMs() {
  return performance.now();
}

function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * ✅ Fix for TS2339:
 * three.js renderer.info.render does NOT include `instances`.
 * We compute instanced instance count by traversing scene and summing InstancedMesh.count.
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

/**
 * A minimal but robust Three.js root:
 * - WebGLRenderer + EffectComposer
 * - Tone mapping (ACES) + optional bloom
 * - Dynamic near/far and Floating Origin hooks
 * - Debug stats getter (calls/triangles/instanced/etc)
 *
 * NOTE:
 * This file is written to compile cleanly under strict TS.
 * If your project had additional systems (post lens pass, atmosphere pass, etc),
 * you can re-insert them in the "CUSTOM PASSES" section below without reintroducing the `instances` field.
 */
export class ThreeRoot {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private finalPass: ShaderPass;

  private canvas: HTMLCanvasElement;

  private preset: GraphicsPreset = "High";
  private postprocessEnabled = true;
  private bloomEnabled = true;

  private lastT = nowMs();
  private fps = 60;
  private fpsSmoother = 0.1;

  // Instanced instance count cached (avoid per-frame traverse)
  private instancedCached = 0;
  private instancedCacheEveryNFrames = 10;

  // Floating origin support
  // You can call `applyFloatingOriginShift(shift)` externally when simulation decides to rebase.
  private floatingOrigin = new THREE.Vector3(0, 0, 0);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // we use post/TAA optionally elsewhere
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
    this.renderer.toneMappingExposure = 1.0;

    // Scene / Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1e6);
    this.camera.position.set(0, 10, 30);
    this.camera.lookAt(0, 0, 0);

    // Basic lighting (your project may override with physically-based sun light)
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x111122, 0.15);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(50, 30, 20);
    dir.castShadow = false;
    this.scene.add(dir);

    // Postprocess composer
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.35, // strength
      0.6, // radius
      0.85 // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Final (simple copy / place for lens pass insertion)
    this.finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          gl_FragColor = c;
        }
      `,
    });
    this.composer.addPass(this.finalPass);

    this.applyPreset(this.preset);

    // Example: a starfield placeholder (procedural points)
    this.scene.add(this.createProceduralStarfield());

    // Initial resize
    this.resize(canvas.clientWidth, canvas.clientHeight);
  }

  // ---------- Public API ----------

  public dispose() {
    this.composer?.dispose();
    this.renderer?.dispose();
  }

  public resize(w: number, h: number) {
    const width = Math.max(1, w);
    const height = Math.max(1, h);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);

    this.bloomPass.setSize(width, height);
  }

  public setExposure(exposure: number) {
    this.renderer.toneMappingExposure = clamp(exposure, 0.1, 5.0);
  }

  public setPostprocessEnabled(on: boolean) {
    this.postprocessEnabled = on;
  }

  public setBloomEnabled(on: boolean) {
    this.bloomEnabled = on;
  }

  public applyPreset(preset: GraphicsPreset) {
    this.preset = preset;

    // Pixel ratio
    if (preset === "Low") this.renderer.setPixelRatio(Math.min(1.0, window.devicePixelRatio || 1));
    else if (preset === "Medium") this.renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    else if (preset === "High") this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    else this.renderer.setPixelRatio(Math.min(2.0, window.devicePixelRatio || 1));

    // Bloom parameters (conservative)
    if (preset === "Low") {
      this.bloomPass.strength = 0.2;
      this.bloomPass.radius = 0.45;
      this.bloomPass.threshold = 0.92;
    } else if (preset === "Medium") {
      this.bloomPass.strength = 0.28;
      this.bloomPass.radius = 0.55;
      this.bloomPass.threshold = 0.9;
    } else if (preset === "High") {
      this.bloomPass.strength = 0.34;
      this.bloomPass.radius = 0.6;
      this.bloomPass.threshold = 0.88;
    } else {
      // Cinematic++
      this.bloomPass.strength = 0.38;
      this.bloomPass.radius = 0.65;
      this.bloomPass.threshold = 0.86;
    }
  }

  /**
   * Floating origin shift:
   * call this when your simulation re-bases coordinates.
   * shift: world shift applied (e.g., cameraFocusPos before - after)
   */
  public applyFloatingOriginShift(shift: THREE.Vector3) {
    // Accumulate origin offset
    this.floatingOrigin.add(shift);

    // Shift scene objects (only those meant to be in world space)
    // In your project, you might keep celestial bodies in a dedicated group.
    // This generic implementation shifts the entire scene.
    this.scene.traverse((o) => {
      // skip camera & lights? (camera handled separately)
      if (o === this.camera) return;
      // shift Object3D position
      o.position.add(shift);
    });

    // Shift camera opposite to keep view stable
    this.camera.position.add(shift);
  }

  /**
   * Dynamic near/far: call every frame with an estimated scene scale.
   * - near increases when close to surface to reduce z-fighting
   * - far increases when in deep space
   */
  public updateNearFar(nearHint: number, farHint: number) {
    const n = clamp(nearHint, 0.01, 5000);
    const f = clamp(farHint, 100, 5e8);

    // smooth changes to avoid popping
    const targetNear = n;
    const targetFar = f;

    this.camera.near = lerp(this.camera.near, targetNear, 0.25);
    this.camera.far = lerp(this.camera.far, targetFar, 0.25);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Main tick: call in your RAF loop.
   * dtSeconds is optional; if omitted it is computed.
   */
  public tick(dtSeconds?: number) {
    const t = nowMs();
    const dt = dtSeconds ?? (t - this.lastT) / 1000;
    this.lastT = t;

    // FPS smoothing
    const instFps = dt > 1e-6 ? 1 / dt : 999;
    this.fps = lerp(this.fps, instFps, this.fpsSmoother);

    // Optional: update starfield twinkle
    this.animateStarfield(dt);

    // Cache instanced instance count every N frames (cheap)
    const frame = this.renderer.info.render.frame ?? 0;
    if (frame % this.instancedCacheEveryNFrames === 0) {
      this.instancedCached = countInstancedInstances(this.scene);
    }

    // Render
    if (this.postprocessEnabled) {
      // Bloom toggle
      this.bloomPass.enabled = this.bloomEnabled;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public getDebugStats(): DebugStats {
    const r = this.renderer.info.render;

    return {
      fps: Math.round(this.fps),
      calls: r.calls,
      triangles: r.triangles,
      lines: r.lines,
      points: r.points,
      instanced: this.instancedCached, // ✅ renderer.info.render.instances 대신 우리가 계산한 값
      preset: this.preset,
    };
  }

  // ---------- Internals / Demo content ----------

  private starfield?: THREE.Points;
  private starfieldGeom?: THREE.BufferGeometry;

  private createProceduralStarfield() {
    const count = 4000;
    const radius = 20000;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const c = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // random direction on sphere
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * (0.7 + 0.3 * Math.random());

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // star color temperature-ish
      const t = Math.random();
      c.setHSL(0.58 - 0.08 * t, 0.2 + 0.25 * t, 0.75 + 0.2 * Math.random());
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = 0.5 + Math.random() * 1.5;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    this.starfieldGeom = geom;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        uniform float uTime;
        uniform float uPixelRatio;

        void main() {
          vColor = color;

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // subtle twinkle by depth
          float tw = 0.85 + 0.15 * sin(uTime + position.x * 0.0002 + position.y * 0.00017);
          float s = size * tw;

          gl_PointSize = s * uPixelRatio * (600.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
          float d = dot(uv, uv);
          float a = smoothstep(1.0, 0.0, d);
          vec3 c = vColor;
          gl_FragColor = vec4(c, a);
        }
      `,
    });

    const pts = new THREE.Points(geom, mat);
    pts.frustumCulled = false;
    this.starfield = pts;
    return pts;
  }

  private animateStarfield(dt: number) {
    if (!this.starfield) return;
    const mat = this.starfield.material as THREE.ShaderMaterial;
    if (!mat.uniforms) return;
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
  }
}

export default ThreeRoot;
