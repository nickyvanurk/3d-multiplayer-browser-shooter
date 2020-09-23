export default class Game {
  constructor() {
    this.lastTime = performance.now();
    
    this.ws = new WebSocket(`ws://${process.env.SERVER_URL}:${process.env.PORT}`);
    this.ws.onopen = this.handleConnect.bind(this);
    this.ws.onclose = this.handleDisconnect.bind(this);
    this.ws.onmessage = (event) => { this.handleMessage(event.data); };

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

    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }

  handleConnect() {
    console.log(`Connected to server ${process.env.SERVER_URL}:${process.env.PORT}`);
  }

  handleDisconnect() {
    console.log('Disconnected from server');
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    console.log(message);

    switch (message) {
      case 'go':
        this.sendMessage('hello');
        break;
    }
  }

  sendMessage(message) {
    this.ws.send(JSON.stringify(message));
  }
}

