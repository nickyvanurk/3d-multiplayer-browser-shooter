import type WebSocket from 'ws';

import logger from './utils/logger.ts';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import type Server from './server.ts';

export type ClientSocket = WebSocket & { remoteAddress?: string };

export interface OutgoingMessage {
  serialize(): unknown[];
}

interface IncomingMessage {
  type: unknown;
  data: { name: string };
}

interface BufferedInput {
  type: unknown;
  data: ReturnType<typeof Messages.Input.deserialize>;
  seq: number;
}

type MessageData =
  | unknown[]
  | { name: string }
  | ReturnType<typeof Messages.Input.deserialize>;

export default class Connection {
  id: number;
  connection: ClientSocket;
  server: Server;
  incomingMessageQueue: IncomingMessage[];
  outgoingMessageQueue: OutgoingMessage[];
  inputBuffer: BufferedInput[];
  sequenceNumber: number;
  lastProcessedInput: number;
  onCloseCallback?: () => void;

  constructor(id: number, connection: ClientSocket, server: Server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];
    this.inputBuffer = [];
    this.sequenceNumber = 0;
    this.lastProcessedInput = -1;

    this.connection.on('message', (message) => {
      let data: MessageData = JSON.parse(message as string) as unknown[];
      const type = data.shift();

      switch (type) {
        case Types.Messages.HELLO:
          data = Messages.Hello.deserialize(data as string[]);
          this.incomingMessageQueue.push({ type, data });
          break;
        case Types.Messages.INPUT:
          data = Messages.Input.deserialize(
            data as Parameters<typeof Messages.Input.deserialize>[0],
          );
          this.inputBuffer.push({ type, data, seq: this.sequenceNumber++ });
          break;
      }
    });

    this.connection.on('close', () => {
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }

      // The `delete` operand here is a void call, not a property reference, so
      // the operator is a runtime no-op — the meaningful work is the call's
      // side effects. Preserved byte-for-byte; TS correctly rejects the form.
      // @ts-expect-error TS2703: operand of 'delete' must be a property reference
      delete this.server.removeConnection(this.id);
    });
  }

  onDisconnect(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  pushMessage(message: OutgoingMessage): void {
    this.outgoingMessageQueue.push(message);
  }

  popMessage(): IncomingMessage | undefined {
    return this.incomingMessageQueue.shift();
  }

  sendOutgoingMessages(): void {
    while (this.hasOutgoingMessage()) {
      const message = this.outgoingMessageQueue.shift();
      this.connection.send(JSON.stringify(message!.serialize()));
    }
  }

  send(message: unknown): void {
    this.connection.send(JSON.stringify(message));
  }

  hasIncomingMessage(): boolean {
    return this.incomingMessageQueue.length > 0;
  }

  hasOutgoingMessage(): boolean {
    return this.outgoingMessageQueue.length > 0;
  }

  popInput(): BufferedInput | undefined {
    return this.inputBuffer.shift();
  }

  hasInputs(): boolean {
    return this.inputBuffer.length > 0;
  }

  close(error: unknown): void {
    logger.info(
      `Closing connection to ${this.connection.remoteAddress}. Error: ${error}`,
    );
    this.connection.terminate();
  }
}
