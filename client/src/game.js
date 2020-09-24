import { World } from 'ecsy';

import { Connection } from '../../shared/components/connection';
import { NetworkEventSystem } from './systems/network-event-system';
import { NetworkMessageSystem } from '../../shared/systems/network-message-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();

    this.world = new World()
      .registerComponent(Connection)
      .registerSystem(NetworkEventSystem)
      .registerSystem(NetworkMessageSystem);

    this.init();
  }

  init() {
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

  handleConnect(connection) {
    this.world
      .createEntity()
      .addComponent(Connection, { value: connection });
  }
}

