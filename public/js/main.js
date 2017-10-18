class Entity {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
  }
}

class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection.bind(this);
    this.ws.onmessage = this.processServerMessages.bind(this);

    this.id = null;

    this.entities = {};
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
        for (let i = 0; i < message.states.length; i++) {
          let state = message.states[i];

          // if this is the first time we see this entity, create local representation
          if (!this.entities[state.id]) {
            let entity = new Entity();
            entity.id = state.id;
            this.entities[state.id] = entity;
          }

          let entity = this.entities[state.id];

          entity.x = state.position.x;
          entity.y = state.position.y;
          entity.z = state.position.z;
        }
        break;
    }
  }
}

const client = new Client();