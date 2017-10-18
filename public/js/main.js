class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection;
    this.ws.onmessage = this.processServerMessages;

    this.id = null;
  }

  onConnection() {
    console.log('Connected to server');
  }

  processServerMessages(event) {
    let message = JSON.parse(event.data);
    
    switch(message.type) {
      case 'id':
        this.id = message.id;
        console.log(`Client ID set to: ${this.id}`);
        break;
      case 'worldState':
        console.log(message.states);
        break;
    }
  }
}

const client = new Client();