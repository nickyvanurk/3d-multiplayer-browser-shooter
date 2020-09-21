export default class Game {
  constructor() {
    this.lastTime = performance.now();

    this.init();
  }

  init() {
    console.info('Initializing client');

    this.socket = new WebSocket(`ws://${process.env.SERVER_URL}:${process.env.PORT}`);
    this.socket.onopen = this.handleConnect.bind(this);
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

  handleConnect() {
    console.log(`Connected to server ${process.env.SERVER_URL}:${process.env.PORT}`);
  }
}

