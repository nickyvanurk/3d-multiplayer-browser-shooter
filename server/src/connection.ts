import { performance } from 'perf_hooks';
import type WebSocket from 'ws';

import logger from './utils/logger.ts';
import Types from '../../shared/types.ts';
import Messages from '../../shared/messages.ts';
import type Server from './server.ts';

export type ClientSocket = WebSocket & { remoteAddress?: string };

export interface OutgoingMessage {
  serialize(): unknown[] | Uint8Array;
}

interface HelloMessage {
  type: unknown;
  data: { name: string };
}

type StateData = ReturnType<typeof Messages.State.deserialize>;
type FireData = ReturnType<typeof Messages.Fire.deserialize>;
type HitData = ReturnType<typeof Messages.Hit.deserialize>;
type EquipData = ReturnType<typeof Messages.Equip.deserialize>;

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
  // Hit reports (client-side hit detection) are events too — each one is a shot
  // that struck something, so they queue and all get applied.
  hitQueue: HitData[];
  // Vendor trades are idempotent within a tick (a second sell finds an empty
  // hold; a second repair finds full health), so they latch as booleans rather
  // than queue.
  sellRequested: boolean;
  repairRequested: boolean;
  // Shop requests latch as the latest requested value (null = none). Buy is
  // idempotent (a second buy of an owned item is a no-op); equip is last-write-wins
  // and carries the target slot + item id.
  pendingBuy: number | null;
  pendingEquip: EquipData | null;
  onCloseCallback?: () => void;

  constructor(id: number, connection: ClientSocket, server: Server) {
    this.id = id;
    this.connection = connection;
    this.server = server;

    this.incomingMessageQueue = [];
    this.outgoingMessageQueue = [];
    this.latestState = null;
    this.fireQueue = [];
    this.hitQueue = [];
    this.sellRequested = false;
    this.repairRequested = false;
    this.pendingBuy = null;
    this.pendingEquip = null;

    this.connection.on('message', (message) => {
      // High-frequency pose messages (State) arrive as bit-packed binary frames.
      // ws delivers every frame as a Buffer; JSON messages are arrays, so their
      // first byte is '[' (0x5B), while a bit-packed frame leads with a small tag
      // byte — that difference discriminates binary from text.
      if (typeof message !== 'string') {
        const buf = message as Buffer;
        if (buf.length > 0 && buf[0] !== 0x5b) {
          const bytes = Uint8Array.from(buf);
          if (bytes[0] === Types.Messages.STATE) {
            this.latestState = Messages.State.deserialize(bytes);
          }
          return;
        }
      }

      const data = JSON.parse(message as string) as unknown[];
      const type = data.shift();

      switch (type) {
        case Types.Messages.HELLO:
          this.incomingMessageQueue.push({
            type,
            data: Messages.Hello.deserialize(data as string[]),
          });
          break;
        case Types.Messages.FIRE:
          this.fireQueue.push(Messages.Fire.deserialize(data as number[]));
          break;
        case Types.Messages.HIT:
          this.hitQueue.push(Messages.Hit.deserialize(data as number[]));
          break;
        case Types.Messages.PING:
          // Answer immediately (not on the tick) and stamp the reply with the
          // server's wall clock, so the client's measured RTT is pure network
          // latency without a tick-wait, and the latency stays symmetric.
          this.connection.send(
            JSON.stringify(
              new Messages.Pong(
                (data as number[])[0],
                performance.now(),
              ).serialize(),
            ),
          );
          break;
        case Types.Messages.SELL:
          this.sellRequested = true;
          break;
        case Types.Messages.REPAIR:
          this.repairRequested = true;
          break;
        case Types.Messages.BUY:
          this.pendingBuy = Messages.Buy.deserialize(data as number[]).itemId;
          break;
        case Types.Messages.EQUIP:
          this.pendingEquip = Messages.Equip.deserialize(data as number[]);
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

  drainHits(): HitData[] {
    const hits = this.hitQueue;
    this.hitQueue = [];
    return hits;
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

  // Consume this tick's shop requests, clearing them. null = no request.
  drainBuy(): number | null {
    const itemId = this.pendingBuy;
    this.pendingBuy = null;
    return itemId;
  }

  drainEquip(): EquipData | null {
    const equip = this.pendingEquip;
    this.pendingEquip = null;
    return equip;
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
      const payload = message!.serialize();
      if (payload instanceof Uint8Array) {
        this.connection.send(payload);
      } else {
        this.connection.send(JSON.stringify(payload));
      }
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
