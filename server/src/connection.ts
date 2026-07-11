import type WebSocket from 'ws';

import logger from './utils/logger.ts';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import type Server from './server.ts';

export type ClientSocket = WebSocket & { remoteAddress?: string };

export interface OutgoingMessage {
  serialize(): unknown[];
}

interface HelloMessage {
  type: unknown;
  data: { name: string };
}

type StateData = ReturnType<typeof Messages.State.deserialize>;
type FireData = ReturnType<typeof Messages.Fire.deserialize>;

export default class Connection {
  id: number;
  connection: ClientSocket;
  server: Server;
  incomingMessageQueue: HelloMessage[];
  outgoingMessageQueue: OutgoingMessage[];
  // Client-authoritative movement: only the newest reported ship state matters,
  // so it's kept as a single latest value rather than a queue.
  latestState: StateData | null;
  // Fire requests are events; every one must be honored, so they queue.
  fireQueue: FireData[];
  // Clock-sync probes are events; each PING must be answered, so they queue.
  pingQueue: number[];
  // Vendor trades are idempotent within a tick (a second sell finds an empty
  // hold; a second repair finds full health), so they latch as booleans rather
  // than queue.
  sellRequested: boolean;
  repairRequested: boolean;
  onCloseCallback?: () => void;

  constructor(id: number, connection: ClientSocket, server: Server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];
    this.latestState = null;
    this.fireQueue = [];
    this.pingQueue = [];
    this.sellRequested = false;
    this.repairRequested = false;

    this.connection.on('message', (message) => {
      const data = JSON.parse(message as string) as unknown[];
      const type = data.shift();

      switch (type) {
        case Types.Messages.HELLO:
          this.incomingMessageQueue.push({
            type,
            data: Messages.Hello.deserialize(data as string[]),
          });
          break;
        case Types.Messages.STATE:
          this.latestState = Messages.State.deserialize(data as number[]);
          break;
        case Types.Messages.FIRE:
          this.fireQueue.push(Messages.Fire.deserialize(data as number[]));
          break;
        case Types.Messages.PING:
          this.pingQueue.push((data as number[])[0]);
          break;
        case Types.Messages.SELL:
          this.sellRequested = true;
          break;
        case Types.Messages.REPAIR:
          this.repairRequested = true;
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

  popMessage(): HelloMessage | undefined {
    return this.incomingMessageQueue.shift();
  }

  drainFire(): FireData[] {
    const fires = this.fireQueue;
    this.fireQueue = [];
    return fires;
  }

  drainPing(): number[] {
    const pings = this.pingQueue;
    this.pingQueue = [];
    return pings;
  }

  // Consume this tick's vendor-trade latches, clearing them.
  drainSell(): boolean {
    const requested = this.sellRequested;
    this.sellRequested = false;
    return requested;
  }

  drainRepair(): boolean {
    const requested = this.repairRequested;
    this.repairRequested = false;
    return requested;
  }

  // Returns the newest reported state and clears it, so a tick with no fresh
  // State lets the ship coast/collide instead of re-snapping to a stale pose.
  drainState(): StateData | null {
    const state = this.latestState;
    this.latestState = null;
    return state;
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

  close(error: unknown): void {
    logger.info(
      `Closing connection to ${this.connection.remoteAddress}. Error: ${error}`,
    );
    this.connection.terminate();
  }
}
