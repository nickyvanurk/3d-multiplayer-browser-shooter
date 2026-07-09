import { Vector3, Euler } from 'three';
import { Entity } from '../entity.ts';
import type { EntityWorld } from '../entity.ts';
import type { TransformInit } from '../transform.ts';
import { type InputCommand, InputBits } from '../input.ts';
import Types from '../../types.ts';

export interface VendorInit {
  id?: number;
  transform?: TransformInit;
  scale?: number;
}

// The whole orbit must clear the ±2000 asteroid-field cube. The closest an
// XZ-plane circle of radius R gets to the cube is at 45°, where |x|=|z|=R/√2,
// so R > 2000·√2 ≈ 2828 keeps every point outside; 3000 gives margin.
const ORBIT_RADIUS = 3000;
const ORBIT_Y = 0;
// A slow, stately drift for a heavy freighter: ~21 units/sec at R=3000, well
// under the 50 u/s player cruise so it reads as lumbering and is easy to catch.
const ORBIT_PERIOD_MS = 900_000;
const ANGULAR_SPEED = (2 * Math.PI) / ORBIT_PERIOD_MS; // rad/ms

// A server-authoritative NPC transport that flies a fixed circular orbit outside
// the field — the seed of a future vendor mechanic. Kinematic on both sides: the
// server drives it from `transform.position` (RapierPhysicsWorld.applyAll), the
// client dead-reckons the same body so the owned ship physically bumps off it.
export class Vendor extends Entity {
  inputBits: number;
  // Client-only: the replicated inputBits decoded for the renderer (exhaust glow),
  // mirroring Ship.renderInput. Never re-applied as thrust.
  renderInput: InputCommand | null;
  // No AI controller — kept so ViewRegistry.driveExhaust's `controller?.lastInput`
  // reads cleanly (it falls through to renderInput).
  controller = null;

  constructor({ id, transform, scale = 1 }: VendorInit = {}) {
    super({
      id,
      transform: { ...transform, scale },
      type: Types.Entities.VENDOR,
    });
    this.velocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.damping = 0.001;
    this.angularDamping = 0.1;
    this.weight = 0;
    this.kinematic = true;
    this.inputBits = InputBits.forward; // engine always on → exhaust glows
    this.renderInput = null;
  }

  // Fill the trailing input slot so remote clients light the engine from the
  // replicated thrust bits (mirrors Ship.serializeNetworkState).
  serializeNetworkState(): number[] {
    const state = super.serializeNetworkState();
    state[13] = this.inputBits;
    return state;
  }

  // SERVER ONLY. `time` is the deterministic sim clock (ms). The client never
  // calls this (ClientSim ticks only ships); it dead-reckons from the replicated
  // transform + velocity, so there is no client/server-time route fight.
  update(_dt: number, _world: EntityWorld, time: number): void {
    const theta = ANGULAR_SPEED * time;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.transform.position.set(ORBIT_RADIUS * c, ORBIT_Y, ORBIT_RADIUS * s);

    const speed = ORBIT_RADIUS * ANGULAR_SPEED * 1000; // units/second
    this.velocity.set(-speed * s, 0, speed * c); // world-space tangent

    // Face the direction of travel. Ship forward is local +Z (see steering.ts).
    const heading = Math.atan2(this.velocity.x, this.velocity.z);
    this.transform.rotation.setFromEuler(new Euler(0, heading, 0));
  }
}
