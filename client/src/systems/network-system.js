import { System } from 'ecsy';

import Types from '../../../shared/types';

import { Connection } from '../../../shared/components/connection';

export class NetworkSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    }
  };

  init() {
    this.ws = new WebSocket(`ws://${process.env.SERVER_URL}:${process.env.PORT}`);
    this.ws.onopen = this.handleConnect.bind(this);
    this.ws.onclose = this.handleDisconnect.bind(this);
    this.ws.onmessage = (event) => { this.handleMessage(event.data); };
  }

  execute() {
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

    if (message === 'go') {
      console.info('Starting client/server handshake');
      
      // TODO: Get username from UI
      this.sendHello('Nicky');
      return;
    }

    const messageType = message[0];

    if (messageType === Types.Messages.WELCOME) {
      const id = message[1];
      const name = message[2];

      this.world.createEntity().addComponent(Connection, { id, ws: this.ws, name });
    }
  }

  sendMessage(data) {
    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    } catch {
      console.warning('Error sending message');
    }
  }

  sendHello(username = '') {
    this.sendMessage([Types.Messages.HELLO, username]);
  }
}
