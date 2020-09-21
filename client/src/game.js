export default class Game {
  constructor() {
    this.lastTime = performance.now();

    this.init();
  }

  init() {
    console.info('Initializing client');
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }
    
    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }
}

