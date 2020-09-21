import { performance } from 'perf_hooks';
import { World } from 'ecsy';

import logger from './utils/logger';

export class Server {
  constructor() {
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();
    this.world = new World();

    this.init();
  }

  init() {
    logger.info('Initializing server');
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

