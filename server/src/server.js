import logger from './utils/logger';
import { performance } from 'perf_hooks';

export class Server {
  constructor() {
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

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
    
    this.lastTime = time;

    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);
  }
}

