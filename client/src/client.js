const logger = console;

export default class Client {
  constructor() {
    let host = location.origin.replace(/^http|https/, 'ws');

    if (process.env.NODE_ENV === 'development') {
      host = 'ws://localhost:1337'
    }

    this.ws = new WebSocket(host);
    this.isConnected = false;

    this.id = -1;
    this.worldId = -1;

    this.ws.onopen = (event) => {
      //this.heartbeat();

      if (this.onConnectCallback) {
        this.onConnectCallback(event);
      }
    }

    this.ws.onmessage = ({ message }) => {
      logger.debug(`Server: ${message}`);

      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    }

    this.ws.onclose = (event) => {
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(event);
      }
    }

    // TODO: Implement custom ping/pong. Can't detect server pings on client.
    //this.ws.onping = this.heartbeat.bind(this);
  }

  //heartbeat() {
  //  logger.log('heartbeat');

  //  if (this.pingTimeout) {
  //    clearTimeout(this.pingTimeout.bind(this));
  //  }

  //  this.pingTimeout = setTimeout(() => {
  //    this.ws.close();
  //  }, 30000 + 2000); // 32 seconds
  //}

  onConnect(callback) {
    this.isConnected = true;
    this.onConnectCallback = callback;
  }

  onDisconnect(callback) {
    this.isConnected = false;
    this.onDisconnectCallback = callback;
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }
}
