import { Vector3 } from "three";
import type { Vec3 } from "../world/types";
import { V3 } from "../utils/math";

export class FloatingOrigin {
  originOffset = new Vector3(0, 0, 0);
  threshold = 400; // world units

  // shift all objects/camera by -shift
  applyShift(shift: Vector3, bodies: { position: Vec3 }[], cameraPos: Vector3, cameraTarget: Vector3) {
    this.originOffset.add(shift);
    for (const b of bodies) {
      b.position[0] -= shift.x;
      b.position[1] -= shift.y;
      b.position[2] -= shift.z;
    }
    cameraPos.sub(shift);
    cameraTarget.sub(shift);
  }

  maybeRecenter(bodies: { position: Vec3 }[], cameraPos: Vector3, cameraTarget: Vector3) {
    const d = cameraPos.length();
    if (d < this.threshold) return;
    const shift = cameraPos.clone(); // shift so camera back near origin
    this.applyShift(shift, bodies, cameraPos, cameraTarget);
  }

  toStoreVec3(): Vec3 {
    return [this.originOffset.x, this.originOffset.y, this.originOffset.z];
  }

  fromStoreVec3(v: Vec3) {
    this.originOffset.set(v[0], v[1], v[2]);
  }
}
