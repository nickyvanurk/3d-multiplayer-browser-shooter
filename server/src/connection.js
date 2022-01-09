import logger from './utils/logger';

export default class Connection {
  constructor(id, ws) {
    this.id = id;
    this.ws = ws;
    this.isAlive = true;

    this.ws.on('message', (message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });

    this.ws.on('close', () => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    });

    this.ws.on('pong', () => {
      this.isAlive = true
    });
  }

  terminate() {
    logger.info(`Client #${id} terminated`);
    this.ws.terminate();
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onClose(callback) {
    this.onCloseCallback = callback;
  }
}
