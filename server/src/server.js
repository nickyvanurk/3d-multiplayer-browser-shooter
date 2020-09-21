import { performance } from 'perf_hooks';

export class Server {
  constructor() {
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

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
    
    console.log('world update');

    this.lastTime = time;

    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);
  }
}

