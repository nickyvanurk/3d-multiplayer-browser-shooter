export default class Connection {
  constructor(host, port) {
    this.connection = new WebSocket(`ws://${host}:${port}`);

    this.connection.onopen = (event) => {
      if (this.onOpenCallback) {
        this.onOpenCallback(event);
      }
    };

    this.connection.onclose = (event) => {
      if (this.onCloseCallback) {
        this.onCloseCallback(event);
      }
    };

    this.connection.onmessage = (event) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(JSON.parse(event.data));
      }
    };

    this.connection.onerror = (event) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(event);
      }
    };
  }

  onConnection(callback) {
    this.onOpenCallback = callback;
  }

  onDisconnect(callback) {
    this.onCloseCallback = callback;
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }
  
  send(message) {
    this.connection.send(JSON.stringify(message));
  }

  getConnection() {
    return this.connection;
  }
}

