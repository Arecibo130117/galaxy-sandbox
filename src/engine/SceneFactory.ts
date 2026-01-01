import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import type { Body } from "../world/types";
import { PLANET_SURFACE_FRAG, PLANET_SURFACE_VERT } from "../shaders/planetSurface.glsl";
import { ATMOS_FRAG, ATMOS_VERT } from "../shaders/atmosphere.glsl";
import { CLOUDS_FRAG, CLOUDS_VERT } from "../shaders/clouds.glsl";
import { SUN_FRAG, SUN_VERT } from "../shaders/sunCorona.glsl";

export type BodyRender = {
  id: string;
  group: Group;
  surface?: Mesh;
  atmosphere?: Mesh;
  clouds?: Mesh;
  ring?: Mesh;
};

export function makeBodyRender(b: Body) {
  const g = new Group();
  g.name = b.name;

  // surface
  const geom = new SphereGeometry(1, 96, 64);
  const mat = new ShaderMaterial({
    vertexShader: PLANET_SURFACE_VERT,
    fragmentShader: PLANET_SURFACE_FRAG,
    uniforms: {
      uSunDir: { value: new Vector3(1, 0, 0) },
      uSeed: { value: b.materialSeed },
      uSeaLevel: { value: b.ocean?.seaLevel ?? 0.02 },
      uAlbedoBoost: { value: 1.0 },
    },
  });

  const surface = new Mesh(geom, mat);
  surface.castShadow = true;
  surface.receiveShadow = true;

  // star uses emissive corona shader
  if (b.kind === "Star") {
    surface.material = new ShaderMaterial({
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      uniforms: {
        uCameraPosW: { value: new Vector3() },
        uTime: { value: 0 },
      },
    });
  }

  g.add(surface);

  // atmosphere
  let atmoMesh: Mesh | undefined;
  if (b.atmosphere && b.kind !== "Star") {
    const atmoGeom = new SphereGeometry(1, 96, 64);
    const atmoMat = new ShaderMaterial({
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      uniforms: {
        uCameraPosW: { value: new Vector3() },
        uSunDir: { value: new Vector3(1, 0, 0) },

        uPlanetRadius: { value: 1.0 },
        uAtmoHeight: { value: 0.25 },

        uBetaR: { value: new Vector3(5.8e-3, 13.5e-3, 33.1e-3) },
        uBetaM: { value: new Vector3(21e-3, 21e-3, 21e-3) },
        uMieG: { value: 0.76 },
        uHR: { value: 0.12 },
        uHM: { value: 0.05 },

        uSunIntensity: { value: 14.0 },
        uExposure: { value: 1.0 },
        uDither: { value: 1.0 },
        uFrame: { value: 0.0 },

        uPrimarySteps: { value: 32 },
        uLightSteps: { value: 8 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: BackSide, // render from inside shell for better horizon
      blending: AdditiveBlending,
    });

    atmoMesh = new Mesh(atmoGeom, atmoMat);
    g.add(atmoMesh);
  }

  // clouds
  let cloudsMesh: Mesh | undefined;
  if (b.kind === "Planet" || b.kind === "Moon") {
    const cg = new SphereGeometry(1, 96, 64);
    const cm = new ShaderMaterial({
      vertexShader: CLOUDS_VERT,
      fragmentShader: CLOUDS_FRAG,
      uniforms: {
        uCameraPosW: { value: new Vector3() },
        uSunDir: { value: new Vector3(1, 0, 0) },
        uTime: { value: 0 },
        uSeed: { value: b.materialSeed + 11.3 },
        uCoverage: { value: 0.58 },
        uThickness: { value: 1.0 },
        uDither: { value: 1.0 },
        uFrame: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      side: FrontSide,
    });
    cloudsMesh = new Mesh(cg, cm);
    g.add(cloudsMesh);
  }

  return { id: b.id, group: g, surface, atmosphere: atmoMesh, clouds: cloudsMesh } as BodyRender;
}
