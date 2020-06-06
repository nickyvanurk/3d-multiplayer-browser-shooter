import logger from './utils/logger';
import { World } from 'ecsy';
import { performance } from 'perf_hooks';

import { NetworkSystem } from './systems/network-system';
import { PhysicsSystem } from 'shared/src/systems/physics-system';

export class Server {
  private world: World;
  private updatesPerSecond: number;
  private lastTime: number;

  constructor() {
    this.world = new World();
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();

    this.init();
  }

  init() {
    this.world
      .registerSystem(NetworkSystem)
      .registerSystem(PhysicsSystem);
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.world.execute(delta, time);
    this.lastTime = time;

    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);
  }
}
