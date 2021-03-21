import logger from './utils/logger';
import Types from '../../shared/types';
import Messages from '../../shared/messages';

export default class Connection {
  constructor(id, connection, server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];
    this.inputBuffer = [];
    this.sequenceNumber = 0;
    this.lastProcessedInput = -1;

    this.connection.on('message', (message) => {
      let data = JSON.parse(message);
      const type = data.shift();

      switch (type) {
        case Types.Messages.HELLO:
          data = Messages.Hello.deserialize(data);
          this.incomingMessageQueue.push({ type, data });
          break;
        case Types.Messages.INPUT:
          data = Messages.Input.deserialize(data);
          this.inputBuffer.push({ type, data, seq: this.sequenceNumber++ });
          break;
      }
    });

    this.connection.on('close', () => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }

      delete this.server.removeConnection(this.id);
    });
  }

  onDisconnect(callback) {
    this.onCloseCallback = callback;
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

  popInput() {
    return this.inputBuffer.shift();
  }

  hasInputs() {
    return this.inputBuffer.length > 0;
  }

  close(error) {
    logger.info(`Closing connection to ${this.connection.remoteAddress}. Error: ${error}`);
    this.connection.terminate();
  }
}
