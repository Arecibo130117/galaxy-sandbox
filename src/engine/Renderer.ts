import {
  ACESFilmicToneMapping,
  Color,
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";

export class Renderer {
  renderer: WebGLRenderer;
  size = new Vector2(1, 1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // cinematic AA handled by temporal & accumulation
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(1, 1);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(new Color(0x000000), 1);
  }

  setSize(w: number, h: number) {
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
  }

  render(scene: Scene, camera: PerspectiveCamera) {
    this.renderer.render(scene, camera);
  }
}
