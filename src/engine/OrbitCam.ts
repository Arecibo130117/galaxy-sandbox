import { PerspectiveCamera, Vector3 } from "three";
import { clamp } from "../utils/math";

export class OrbitCam {
  camera: PerspectiveCamera;
  target = new Vector3(0, 0, 0);
  distance = 20;
  yaw = 0.8;
  pitch = 0.35;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private mode: "orbit" | "pan" = "orbit";

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  attach(dom: HTMLElement) {
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("mousedown", (e) => {
      if (e.button === 2) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.mode = e.shiftKey ? "pan" : "orbit";
      }
    });
    dom.addEventListener("mouseup", () => (this.dragging = false));
    dom.addEventListener("mouseleave", () => (this.dragging = false));
    dom.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      if (this.mode === "orbit") {
        this.yaw -= dx * 0.003;
        this.pitch = clamp(this.pitch - dy * 0.003, -1.45, 1.45);
      } else {
        // pan
        const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0).multiplyScalar(-dx * 0.01);
        const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1).multiplyScalar(dy * 0.01);
        this.target.add(right).add(up);
      }
    });

    dom.addEventListener("wheel", (e) => {
      const s = Math.exp(e.deltaY * 0.001);
      this.distance = clamp(this.distance * s, 1.0, 5000);
    });
  }

  update() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    const dir = new Vector3(cp * cy, sp, cp * sy);
    const pos = this.target.clone().addScaledVector(dir, this.distance);

    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  setFocus(pos: Vector3, dist: number) {
    this.target.copy(pos);
    this.distance = dist;
  }
}
