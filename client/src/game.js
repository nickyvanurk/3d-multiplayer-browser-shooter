export default class Game {
  constructor() {
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

    requestAnimationFrame(this.run.bind(this));
  }
}

