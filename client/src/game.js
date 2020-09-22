import { World } from 'ecsy';

import { Connection } from '../../shared/components/connection';
import { NetworkSystem } from './systems/network-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();
    this.world = new World();

    this.init();
  }

  init() {
    this.world
      .registerComponent(Connection)
      .registerSystem(NetworkSystem);
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.world.execute(delta, time);
    
    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }
}

