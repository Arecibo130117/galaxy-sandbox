import RAPIER from "@dimforge/rapier3d-compat";
import type { Body as WBody } from "../world/types";

export type RapierWorld = {
  rapier: typeof RAPIER;
  world: RAPIER.World;
  ready: boolean;
};

export async function createRapierWorld(): Promise<RapierWorld> {
  await RAPIER.init();
  const gravity = new RAPIER.Vector3(0, 0, 0);
  const world = new RAPIER.World(gravity);
  return { rapier: RAPIER, world, ready: true };
}

export type RigidHandle = {
  id: string;
  rb: RAPIER.RigidBody;
  collider: RAPIER.Collider;
};

export function upsertRigidForBody(rw: RapierWorld, b: WBody, existing?: RigidHandle): RigidHandle {
  const R = rw.rapier;
  if (existing) return existing;

  const rbDesc = R.RigidBodyDesc.dynamic().setTranslation(b.position[0], b.position[1], b.position[2]);
  const rb = rw.world.createRigidBody(rbDesc);

  const colDesc = R.ColliderDesc.ball(Math.max(0.02, b.radius * 0.35)).setRestitution(0.05);
  const collider = rw.world.createCollider(colDesc, rb);

  return { id: b.id, rb, collider };
}

export function syncBodyToRigid(h: RigidHandle, b: WBody) {
  h.rb.setTranslation({ x: b.position[0], y: b.position[1], z: b.position[2] }, true);
  h.rb.setLinvel({ x: b.velocity[0], y: b.velocity[1], z: b.velocity[2] }, true);
}

export function syncRigidToBody(h: RigidHandle, b: WBody): WBody {
  const p = h.rb.translation();
  const v = h.rb.linvel();
  return {
    ...b,
    position: [p.x, p.y, p.z],
    velocity: [v.x, v.y, v.z],
  };
}
