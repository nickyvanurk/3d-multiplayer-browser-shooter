import Types from '../../shared/types';
import Messages from '../../shared/messages';

export interface OutgoingMessage {
  serialize(): unknown[];
}

// A message drained from the socket: the wire tag plus its deserialized payload.
// Modeled as a discriminated union on `type` so consumers narrow `data` by tag.
export type IncomingMessage =
  | { type: typeof Types.Messages.GO; data: undefined }
  | {
      type: typeof Types.Messages.WELCOME;
      data: ReturnType<typeof Messages.Welcome.deserialize>;
    }
  | {
      type: typeof Types.Messages.SPAWN;
      data: ReturnType<typeof Messages.Spawn.deserialize>;
    }
  | {
      type: typeof Types.Messages.DESPAWN;
      data: ReturnType<typeof Messages.Despawn.deserialize>;
    }
  | {
      type: typeof Types.Messages.WORLD;
      data: ReturnType<typeof Messages.World.deserialize>;
    }
  | {
      type: typeof Types.Messages.OREDROP;
      data: ReturnType<typeof Messages.OreDrop.deserialize>;
    }
  | {
      type: typeof Types.Messages.COLLECT;
      data: ReturnType<typeof Messages.Collect.deserialize>;
    }
  | {
      type: typeof Types.Messages.STATS;
      data: ReturnType<typeof Messages.Stats.deserialize>;
    };

type MessageData =
  | unknown[]
  | ReturnType<typeof Messages.Welcome.deserialize>
  | ReturnType<typeof Messages.Spawn.deserialize>
  | ReturnType<typeof Messages.Despawn.deserialize>
  | ReturnType<typeof Messages.World.deserialize>
  | ReturnType<typeof Messages.OreDrop.deserialize>
  | ReturnType<typeof Messages.Collect.deserialize>
  | ReturnType<typeof Messages.Stats.deserialize>;

export default class Connection {
  connection: WebSocket;
  incomingMessageQueue: IncomingMessage[];
  outgoingMessageQueue: OutgoingMessage[];
  onOpenCallback?: (event: Event) => void;
  onCloseCallback?: (event: CloseEvent) => void;
  onErrorCallback?: (event: Event) => void;

  constructor() {
    let host = location.origin.replace(/^http/, 'ws') + '/voidfall/';

    if (import.meta.env.DEV) {
      host = 'ws://localhost:1337';
    }

    this.connection = new WebSocket(host);

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
      let data: MessageData = JSON.parse(event.data) as unknown[];
      const type = data.shift();

      switch (type) {
        case Types.Messages.GO:
          // Go.deserialize takes no args and returns void; the wire loop calls it
          // uniformly with `data` and discards the result. Byte-identical; TS
          // rejects both the extra argument and the void assignment.
          // @ts-expect-error TS2554/TS2322: 0-arg, void-returning deserialize
          data = Messages.Go.deserialize(data);
          break;
        case Types.Messages.WELCOME:
          data = Messages.Welcome.deserialize(data as [number, string]);
          break;
        case Types.Messages.SPAWN:
          data = Messages.Spawn.deserialize(data as number[]);
          break;
        case Types.Messages.DESPAWN:
          data = Messages.Despawn.deserialize(data as number[]);
          break;
        case Types.Messages.WORLD:
          data = Messages.World.deserialize(data as number[]);
          break;
        case Types.Messages.OREDROP:
          data = Messages.OreDrop.deserialize(data as number[]);
          break;
        case Types.Messages.COLLECT:
          data = Messages.Collect.deserialize(data as number[]);
          break;
        case Types.Messages.STATS:
          data = Messages.Stats.deserialize(data as number[]);
          break;
      }

      this.incomingMessageQueue.push({
        type,
        data,
      } as unknown as IncomingMessage);
    };

    this.connection.onerror = (event) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(event);
      }
    };
  }

  onConnection(callback: (event: Event) => void): void {
    this.onOpenCallback = callback;
  }

  onDisconnect(callback: (event: CloseEvent) => void): void {
    this.onCloseCallback = callback;
  }

  onError(callback: (event: Event) => void): void {
    this.onErrorCallback = callback;
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

  getConnection(): WebSocket {
    return this.connection;
  }
}
