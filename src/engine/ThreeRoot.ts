import {
  AmbientLight,
  Clock,
  DirectionalLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  IcosahedronGeometry,
  InstancedMesh,
  DynamicDrawUsage,
  Quaternion,
  Plane,
  ShaderMaterial,
  PlaneGeometry,
  AdditiveBlending,
  DoubleSide,
  MeshStandardMaterial,
  Color,
} from "three";

import { Renderer } from "./Renderer";
import { Postprocess } from "./Postprocess";
import { OrbitCam } from "./OrbitCam";
import { FloatingOrigin } from "./FloatingOrigin";
import { makeBodyRender, type BodyRender } from "./SceneFactory";

import { useStore } from "../app/state/store";
import type { SettingsState, ToolState, WorldSnapshot } from "../app/state/store";
import type { Body, Vec3 } from "../world/types";
import { V3, clamp } from "../utils/math";
import { smoothDamp } from "../utils/profiling";
import { advanceTime } from "../simulation/timeflow";
import { updateKeplerOrbits } from "../simulation/orbits";
import { applyGravityStep } from "../simulation/gravity";
import { integrateBodies } from "../simulation/integrator";
import { createRapierWorld, upsertRigidForBody, syncBodyToRigid, syncRigidToBody, type RigidHandle, type RapierWorld } from "../physics/rapier";
import { tickChallenges } from "../gameplay/challenges";
import { spawnAsteroidsBrush, spawnBlackholeAtCursor, spawnPlanetAtCursor } from "../gameplay/tools";
import { SHOCK_FRAG, SHOCK_VERT } from "../shaders/shockwave.glsl";
import { CRATER_FRAG, CRATER_VERT } from "../shaders/craterDecal.glsl";

type SyncIn = {
  settings: SettingsState;
  tools: ToolState;
  bodies: Body[];
  selectedId: string | null;
  time: { t: number; timeScale: any; paused: boolean };
  originOffset: Vec3;
};

export class ThreeRoot {
  private canvas!: HTMLCanvasElement;
  private container!: HTMLElement;

  private renderer!: Renderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(55, 1, 0.05, 5000);
  private orbit = new OrbitCam(this.camera);

  private post!: Postprocess;

  private clock = new Clock();

  private floating = new FloatingOrigin();

  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private pointerDown = false;

  private light = new DirectionalLight(0xffffff, 2.0);
  private ambient = new AmbientLight(0x223344, 0.6);

  private bodyRenders = new Map<string, BodyRender>();

  private rapierWorld: RapierWorld | null = null;
  private rapierHandles = new Map<string, RigidHandle>();

  private runtimeSink: ((rt: { fps: number; drawCalls: number; instances: number }) => void) | null = null;
  private smoothedFps = 0;

  // FX
  private shockwaves: { mesh: Mesh; t: number; energy: number }[] = [];
  private craters: { mesh: Mesh; age: number }[] = [];
  private lastFrameId = 0;

  // store snapshot mirror
  private settings!: SettingsState;
  private tools!: ToolState;
  private bodies!: Body[];
  private selectedId!: string | null;
  private time!: { t: number; timeScale: any; paused: boolean };

  attach(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "w-full h-full";
    container.appendChild(this.canvas);

    this.renderer = new Renderer(this.canvas);
    this.post = new Postprocess(this.renderer.renderer, this.scene, this.camera);

    this.scene.add(this.ambient);
    this.scene.add(this.light);
    this.light.position.set(40, 25, 15);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);

    this.orbit.attach(this.canvas);

    window.addEventListener("resize", this.onResize);
    this.onResize();

    // input
    this.canvas.addEventListener("mousemove", (e) => this.onPointer(e));
    this.canvas.addEventListener("mousedown", (e) => this.onPointerDown(e));
    this.canvas.addEventListener("mouseup", () => (this.pointerDown = false));

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "b") this.trySpawnBlackhole();
      if (e.key.toLowerCase() === "p") useStore.getState().setTime({ paused: !useStore.getState().time.paused });
      if (e.key.toLowerCase() === "o") (window as any).__STEP_ONE_FRAME__?.();
    });

    (window as any).__STEP_ONE_FRAME__ = () => {
      // one frame step: temporarily unpause and advance tiny dt
      useStore.getState().setTime({ paused: true });
      this.stepOnce(1 / 60);
    };
  }

  setRuntimeSink(fn: (rt: any) => void) {
    this.runtimeSink = fn;
  }

  syncFromStore(s: SyncIn) {
    this.settings = s.settings;
    this.tools = s.tools;
    this.bodies = s.bodies;
    this.selectedId = s.selectedId;
    this.time = s.time;
    this.floating.fromStoreVec3(s.originOffset);

    // apply global renderer exposure
    this.renderer.renderer.toneMappingExposure = this.settings.exposure;

    // shadow toggle
    this.renderer.renderer.shadowMap.enabled = this.settings.shadows !== "Off";
  }

  onWorldChanged() {
    // rebuild render objects
    for (const [id, br] of this.bodyRenders) {
      this.scene.remove(br.group);
    }
    this.bodyRenders.clear();

    for (const b of this.bodies) {
      const br = makeBodyRender(b);
      this.bodyRenders.set(b.id, br);
      this.scene.add(br.group);
    }
  }

  async start() {
    // rapier init
    if (!this.rapierWorld) this.rapierWorld = await createRapierWorld();
    this.clock.start();
    this.tick();
  }

  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.container?.removeChild(this.canvas);
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  };

  private onPointer(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  private onPointerDown(e: MouseEvent) {
    this.pointerDown = true;

    // LMB selection
    if (e.button === 0 && !e.shiftKey && !e.altKey) {
      const hit = this.pickBody();
      useStore.getState().setSelected(hit?.id ?? null);
    }

    // Alt+LMB planet create (as per UI hint)
    if (e.button === 0 && e.altKey) {
      this.tryCreatePlanet();
    }
  }

  private pickBody() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: Object3D[] = [];
    for (const br of this.bodyRenders.values()) meshes.push(br.group);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;

    // find parent group id
    const obj = hits[0].object;
    let p: Object3D | null = obj;
    while (p && !this.bodies.find((b) => b.name === p?.name)) p = p.parent;
    if (!p) return null;
    const b = this.bodies.find((x) => x.name === p!.name);
    return b ?? null;
  }

  private getCursorWorldPoint(distance = 30) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this.raycaster.ray.origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(distance));
    return p;
  }

  private tryCreatePlanet() {
    const pos = this.getCursorWorldPoint(40);
    const created = spawnPlanetAtCursor(pos, this.tools.planetCreate);
    useStore.getState().setBodies((prev) => [...prev, created]);
    useStore.getState().setSelected(created.id);
    this.onWorldChanged();
  }

  private trySpawnBlackhole() {
    const pos = this.getCursorWorldPoint(50);
    const bh = spawnBlackholeAtCursor(pos, this.tools.blackhole);
    // keep single BH for clarity
    useStore.getState().setBodies((prev) => [...prev.filter((b) => b.kind !== "BlackHole"), bh]);
    useStore.getState().setSelected(bh.id);
    this.onWorldChanged();
  }

  private dynamicClipPlanes() {
    // near based on closest visible body radius/distance
    let minD = 1e9;
    for (const b of this.bodies) {
      if (!b.visible) continue;
      const dx = b.position[0] - this.camera.position.x;
      const dy = b.position[1] - this.camera.position.y;
      const dz = b.position[2] - this.camera.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - b.radius * this.tools.radiusScale;
      minD = Math.min(minD, d);
    }
    const near = clamp(minD * 0.05, 0.02, 20);
    // far based on furthest visible body
    let maxD = 1000;
    for (const b of this.bodies) {
      if (!b.visible) continue;
      const dx = b.position[0] - this.camera.position.x;
      const dy = b.position[1] - this.camera.position.y;
      const dz = b.position[2] - this.camera.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + b.radius * this.tools.radiusScale;
      maxD = Math.max(maxD, d);
    }
    const far = clamp(maxD * 3.0, 200, 20000);
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  private updateBodyRenders(dt: number) {
    const sun = this.bodies.find((b) => b.kind === "Star" && b.name === "Sun");
    const sunDir = sun
      ? new Vector3(sun.position[0], sun.position[1], sun.position[2]).sub(this.camera.position).normalize().negate()
      : new Vector3(1, 0, 0);

    // lighting direction
    this.light.position.copy(sunDir.clone().multiplyScalar(-80).add(new Vector3(0, 15, 0)));
    (this.light.target as any)?.position?.set(0, 0, 0);

    for (const b of this.bodies) {
      const br = this.bodyRenders.get(b.id);
      if (!br) continue;

      br.group.visible = b.visible;
      br.group.position.set(b.position[0], b.position[1], b.position[2]);

      const scale = b.radius * this.tools.radiusScale;
      br.group.scale.setScalar(scale);

      // rotate
      const phase = (b.rotation.phase + b.rotation.spin * dt) % (Math.PI * 2);
      b.rotation.phase = phase;
      br.group.rotation.y = phase;
      br.group.rotation.z = (b.rotation.tiltDeg * Math.PI) / 180;

      // surface uniforms
      const surfaceMat = br.surface?.material as any;
      if (surfaceMat?.uniforms?.uSunDir) surfaceMat.uniforms.uSunDir.value.copy(sunDir);
      if (surfaceMat?.uniforms?.uSeaLevel) surfaceMat.uniforms.uSeaLevel.value = b.ocean?.seaLevel ?? 0.02;
      if (surfaceMat?.uniforms?.uAlbedoBoost) surfaceMat.uniforms.uAlbedoBoost.value = 1.0;

      // star corona needs camera pos/time
      const starMat = br.surface?.material as any;
      if (b.kind === "Star" && starMat?.uniforms?.uCameraPosW) {
        starMat.uniforms.uCameraPosW.value.copy(this.camera.position);
        starMat.uniforms.uTime.value = this.time.t;
      }

      // atmosphere uniforms
      const atmoMat = br.atmosphere?.material as any;
      if (atmoMat?.uniforms) {
        atmoMat.uniforms.uCameraPosW.value.copy(this.camera.position);
        atmoMat.uniforms.uSunDir.value.copy(sunDir);
        const at = b.atmosphere!;
        atmoMat.uniforms.uPlanetRadius.value = 1.0;
        atmoMat.uniforms.uAtmoHeight.value = Math.max(0.02, at.atmosphereHeight);
        atmoMat.uniforms.uBetaR.value.set(at.betaRayleigh[0], at.betaRayleigh[1], at.betaRayleigh[2]);
        atmoMat.uniforms.uBetaM.value.set(at.betaMie[0], at.betaMie[1], at.betaMie[2]);
        atmoMat.uniforms.uMieG.value = at.mieG;
        atmoMat.uniforms.uHR.value = at.scaleHeightR;
        atmoMat.uniforms.uHM.value = at.scaleHeightM;
        atmoMat.uniforms.uSunIntensity.value = at.sunIntensity;
        atmoMat.uniforms.uExposure.value = this.settings.exposure;

        // quality steps
        const q = this.settings.atmosphereQuality;
        const primary = q === "Cinematic++" ? 64 : q === "High" ? 36 : q === "Med" ? 16 : 10;
        const lightSteps = q === "Cinematic++" ? 16 : q === "High" ? 10 : q === "Med" ? 6 : 4;
        atmoMat.uniforms.uPrimarySteps.value = primary;
        atmoMat.uniforms.uLightSteps.value = lightSteps;
        atmoMat.uniforms.uDither.value = this.settings.dither ? 1.0 : 0.0;
        atmoMat.uniforms.uFrame.value = this.lastFrameId;
      }

      // clouds
      const cMat = br.clouds?.material as any;
      if (cMat?.uniforms) {
        cMat.uniforms.uCameraPosW.value.copy(this.camera.position);
        cMat.uniforms.uSunDir.value.copy(sunDir);
        cMat.uniforms.uTime.value = this.time.t;
        cMat.uniforms.uDither.value = this.settings.dither ? 1.0 : 0.0;
        cMat.uniforms.uFrame.value = this.lastFrameId;
        // earth-like: more coverage
        cMat.uniforms.uCoverage.value = b.name === "Earth" ? 0.55 : 0.64;
        cMat.uniforms.uThickness.value = b.name === "Earth" ? 1.2 : 0.7;
      }

      // clouds shell offset
      if (br.clouds) br.clouds.scale.setScalar(1.01 + (b.atmosphere ? 0.02 : 0.01));
      if (br.atmosphere) br.atmosphere.scale.setScalar(1.02);
    }
  }

  private updatePostprocess() {
    // blackhole info
    const bh = this.bodies.find((b) => b.kind === "BlackHole");
    if (bh?.blackhole) {
      const posW = new Vector3(bh.position[0], bh.position[1], bh.position[2]);
      const posVS = posW.clone().applyMatrix4(this.camera.matrixWorldInverse);
      // map world radius to px using approximate projection
      const dist = Math.max(0.5, -posVS.z);
      const pxPerUnit = (this.renderer.size.y * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360) / dist;
      const horizonPx = bh.blackhole.horizonRadius * pxPerUnit;
      const absorbPx = bh.blackhole.absorbRadius * pxPerUnit;

      const strength = this.settings.lensStrength * bh.blackhole.lensStrength;
      this.post.setBlackhole(posVS, horizonPx, absorbPx, bh.mass, strength);
    } else {
      // push far away
      this.post.setBlackhole(new Vector3(0, 0, -99999), 0.0, 0.0, 0.0, 0.0);
    }

    this.post.setTemporal(this.settings.temporal, this.settings.blackholeLensQuality);
    this.post.setDither(this.settings.dither);
  }

  private updateFX(dt: number) {
    // shockwaves
    for (const s of this.shockwaves) {
      s.t += dt;
      const uT = clamp(s.t / 0.6, 0, 1);
      (s.mesh.material as any).uniforms.uT.value = uT;
      (s.mesh.material as any).uniforms.uEnergy.value = s.energy;
      s.mesh.scale.setScalar(1 + uT * 10);
    }
    this.shockwaves = this.shockwaves.filter((s) => s.t < 0.6);

    // craters
    for (const c of this.craters) {
      c.age += dt;
      (c.mesh.material as any).uniforms.uAge.value = c.age;
    }
    this.craters = this.craters.filter((c) => c.age < 20);
  }

  private spawnImpactFX(point: Vector3, energy: number) {
    // flash is done by bloom-less post; here shockwave billboard
    const geom = new PlaneGeometry(1, 1);
    const mat = new ShaderMaterial({
      vertexShader: SHOCK_VERT,
      fragmentShader: SHOCK_FRAG,
      uniforms: {
        uT: { value: 0 },
        uEnergy: { value: energy },
        uColor: { value: new Vector3(1.0, 0.92, 0.7) },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const m = new Mesh(geom, mat);
    m.position.copy(point);
    m.lookAt(this.camera.position);
    m.scale.setScalar(2.5);
    this.scene.add(m);
    this.shockwaves.push({ mesh: m, t: 0, energy });

    // crater decal: small plane aligned with surface normal approximation
    const g2 = new PlaneGeometry(1, 1);
    const m2 = new ShaderMaterial({
      vertexShader: CRATER_VERT,
      fragmentShader: CRATER_FRAG,
      uniforms: { uAge: { value: 0 }, uScale: { value: 1 }, uSeed: { value: Math.random() * 1000 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const decal = new Mesh(g2, m2);
    decal.position.copy(point);
    decal.lookAt(point.clone().add(point.clone().normalize())); // outward
    decal.rotateX(Math.PI * 0.5);
    decal.scale.setScalar(clamp(energy * 0.15, 0.6, 8));
    this.scene.add(decal);
    this.craters.push({ mesh: decal, age: 0 });
  }

  private stepOnce(dt: number) {
    // world update (store directly)
    const s = useStore.getState();

    // brush spray (gameplay)
    if (s.tools.asteroid.brushOn && this.pointerDown) {
      const spawned = spawnAsteroidsBrush(this.camera, this.tools, dt);
      if (spawned.length) s.setBodies((prev) => [...prev, ...spawned]);
    }

    // kepler orbits (realistic)
    let bodies = updateKeplerOrbits(s.bodies, s.time.t, s.tools.distanceScale, s.settings.mode);

    // gravity/integration (cheap)
    const G = 0.02 * s.settings.gravityGScale * s.tools.massScale;
    bodies = applyGravityStep(bodies, dt, { G, topK: s.settings.gravityTopK });
    bodies = integrateBodies(bodies, dt);

    // blackhole absorb
    const bh = bodies.find((b) => b.kind === "BlackHole");
    if (bh?.blackhole) {
      const absorbR = bh.blackhole.absorbRadius * s.tools.radiusScale;
      bodies = bodies.filter((b) => {
        if (b.id === bh.id) return true;
        const dx = b.position[0] - bh.position[0];
        const dy = b.position[1] - bh.position[1];
        const dz = b.position[2] - bh.position[2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < absorbR) {
          // absorb FX
          this.spawnImpactFX(new Vector3(b.position[0], b.position[1], b.position[2]), 2.0);
          return false;
        }
        return true;
      });
    }

    // collisions (very simplified): detect asteroid vs planet overlap
    // and create impact fx / debris
    const planets = bodies.filter((b) => b.kind === "Planet" || b.kind === "Moon");
    for (const a of bodies.filter((b) => b.kind === "Asteroid" || b.kind === "Debris")) {
      for (const p of planets) {
        const r = (p.radius * s.tools.radiusScale + a.radius * s.tools.radiusScale) * 0.9;
        const dx = a.position[0] - p.position[0];
        const dy = a.position[1] - p.position[1];
        const dz = a.position[2] - p.position[2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r) {
          const v2 = a.velocity[0] ** 2 + a.velocity[1] ** 2 + a.velocity[2] ** 2;
          const E = 0.5 * a.mass * v2;
          s.setTools({ impact: { ...s.tools.impact, lastEnergy: E } });

          // impact fx at contact point on planet surface
          const n = new Vector3(dx, dy, dz).normalize();
          const pt = new Vector3(p.position[0], p.position[1], p.position[2]).add(n.multiplyScalar(p.radius * s.tools.radiusScale));
          this.spawnImpactFX(pt, clamp(E * s.tools.impact.debrisScale, 0.2, 10));

          // remove asteroid (simple)
          bodies = bodies.filter((x) => x.id !== a.id);

          break;
        }
      }
    }

    // floating origin
    this.floating.maybeRecenter(bodies as any, this.camera.position, this.orbit.target);
    s.setOriginOffset(this.floating.toStoreVec3());

    // time advance
    const t2 = advanceTime(s.time.t, dt, s.time.timeScale, s.time.paused);
    s.setTime({ t: t2 });

    // update challenges
    tickChallenges(bodies, s, dt);

    // commit bodies
    s.setBodies(bodies);
  }

  private tick = () => {
    requestAnimationFrame(this.tick);

    const dtRaw = Math.min(1 / 20, this.clock.getDelta());
    const s = useStore.getState();
    this.lastFrameId++;

    // camera tracking
    if (s.tools.trackId) {
      const tr = s.bodies.find((b) => b.id === s.tools.trackId);
      if (tr) {
        const pos = new Vector3(tr.position[0], tr.position[1], tr.position[2]);
        // distance depends on radius
        const d = Math.max(2, tr.radius * s.tools.radiusScale * 4.5);
        this.orbit.setFocus(pos, d);
      }
    }

    // dynamic clip
    this.dynamicClipPlanes();

    // screenshot mode: if paused and screenshot flag, accumulate 3 subframes
    if (s.tools.cinematics.screenshotMode && s.time.paused) {
      for (let i = 0; i < 3; i++) {
        this.stepOnce(1 / 240);
        this.orbit.update();
        this.updateBodyRenders(1 / 240);
        this.updatePostprocess();
        this.updateFX(1 / 240);
        if (s.settings.postprocess) this.post.render(1 / 240, s.time.t);
        else this.renderer.render(this.scene, this.camera);
      }
    } else {
      // normal step
      this.stepOnce(dtRaw);
      this.orbit.update();
      this.updateBodyRenders(dtRaw);
      this.updatePostprocess();
      this.updateFX(dtRaw);

      if (s.settings.postprocess) this.post.render(dtRaw, s.time.t);
      else this.renderer.render(this.scene, this.camera);
    }

    // runtime stats
    const info = this.renderer.renderer.info;
    this.smoothedFps = smoothDamp(this.smoothedFps, 1 / Math.max(1e-6, dtRaw), 6.0, dtRaw);
    this.runtimeSink?.({
      fps: this.smoothedFps,
      drawCalls: info.render.calls,
      instances: info.render.instances,
    });
  };

  makeSnapshot(): WorldSnapshot {
    const s = useStore.getState();
    return {
      bodies: s.bodies,
      selectedId: s.selectedId,
      time: s.time,
      settings: s.settings,
      challenges: s.challenges,
      camera: { pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z], target: [this.orbit.target.x, this.orbit.target.y, this.orbit.target.z] },
      originOffset: this.floating.toStoreVec3(),
    };
  }

  setCameraFromSnapshot(cam: WorldSnapshot["camera"]) {
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    this.orbit.target.set(cam.target[0], cam.target[1], cam.target[2]);
  }
}
