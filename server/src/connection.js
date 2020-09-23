import logger from './utils/logger';

export default class Connection {
  constructor(id, connection, server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.connection.on('message', (message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(JSON.parse(message));
      }
    });
    
    this.connection.on('close', () => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }

      delete this.server.removeConnection(this.id);
    });
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onDisconnect(callback) {
    this.onCloseCallback = callback;
  }

  send(message) { 
    this.connection.send(JSON.stringify(message));
  }

  close(error) {
    logger.info(`Closing connection to ${this.connection.remoteAddress}. Error: ${error}`);
    this.connection.terminate();
  }
}
