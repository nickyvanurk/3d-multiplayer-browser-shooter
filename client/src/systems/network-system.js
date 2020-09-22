import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';

export class NetworkSystem extends System {
  static queries = {
    connections: {
      components: [Connection],
      listen: { added: true }
    }
  };

  init() {
  }

  execute() {
    this.queries.connections.added.forEach(entity => {
      const connection = entity.getComponent(Connection);
      const ws = connection.ws;
      
      ws.onmessage = (event) => { this.handleMessage(connection, event.data); };
  
      // Allow the websocket connection to fully instantiate on server.
      // In the future the user has to input their name so there is a
      // natural delay.
      setTimeout(() => {
        // TODO: Create message codes
        this.sendMessage(connection, 'Hello');
      }, 200);
    });
  }

  handleMessage(connection, data) {
    console.info(`Message from server: ${data}`);

    // TODO: Wait for ID and username
    //       Spawn player
  }

  sendMessage({ ws } = connection, data) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    } catch {
      console.warning('Error sending message');
    }
  }
}
