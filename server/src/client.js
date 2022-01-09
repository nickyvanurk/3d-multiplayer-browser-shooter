import logger from './utils/logger';

export default class Client {
  constructor(id, ws) {
    this.id = id;
    this.ws = ws;
    this.isConnected = true;

    this.ws.on('message', (message) => {
      logger.debug(`Client #${cient.id}: ${message}`);

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
      this.isConnected = true
    });
  }

  hasHeartbeat() {
    if (!this.isConnected) {
      return false;
    }

    this.isConnected = false;
    this.ws.ping();

    return true;
  }

  terminate() {
    this.ws.terminate();
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onClose(callback) {
    this.onCloseCallback = callback;
  }
}
