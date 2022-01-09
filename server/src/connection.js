import logger from './utils/logger';

export default class Connection {
  constructor(id, connection) {
    this.id = id;
    this.connection = connection;

    this.connection.on('message', (message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });

    this.connection.on('close', () => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    });
  }

  terminate() {
    logger.info(`Client #${id} terminated`);
    this.connection.terminate();
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onClose(callback) {
    this.onCloseCallback = callback;
  }
}
