import Types from '../../shared/types';
import Messages from '../../shared/messages';

export default class Connection {
  constructor(host, port) {
    this.connection = new WebSocket(`ws://${host}:${port}`);

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];

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
      let data = JSON.parse(event.data);
      const type = data.shift();
      
      switch (type) {
        case Types.Messages.GO: data = Messages.Go.deserialize(data); break;
        case Types.Messages.WELCOME: data = Messages.Welcome.deserialize(data); break;
      }

      this.incomingMessageQueue.push({ type, data });
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

  onError(callback) {
    this.onErrorCallback = callback;
  }

  pushMessage(message) {
    this.outgoingMessageQueue.push(message);
  }

  popMessage() {
    return this.incomingMessageQueue.shift();
  }

  sendOutgoingMessages() {
    while (this.hasOutgoingMessage()) {
      const message = this.outgoingMessageQueue.shift();
      this.connection.send(JSON.stringify(message.serialize()));
    }
  }
  
  send(message) {
    this.connection.send(JSON.stringify(message));
  }

  hasIncomingMessage() {
    return this.incomingMessageQueue.length > 0;
  }

  hasOutgoingMessage() {
    return this.outgoingMessageQueue.length > 0;
  }

  getConnection() {
    return this.connection;
  }
}

