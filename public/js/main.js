class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection;
    this.ws.onmessage = this.processServerMessages;

    this.entityId = null;
  }

  onConnection() {
    console.log('Connected to server');
  }

  processServerMessages(event) {
    let message = JSON.parse(event.data);
  }
}

const client = new Client();