import assert from 'node:assert/strict';
import Types from '../../shared/types.ts';
import { test } from './harness.ts';
import { NetworkServer } from '../../server/src/net/network-server.ts';

// A minimal fake Connection exposing just what NetworkServer.processIncoming
// touches for the ping path.
function fakeConnection(id: number) {
  const outgoing: unknown[][] = [];
  return {
    id,
    pings: [] as number[],
    incoming: [] as unknown[],
    hasIncomingMessage() {
      return this.incoming.length > 0;
    },
    popMessage() {
      return this.incoming.shift();
    },
    drainPing() {
      const p = this.pings;
      this.pings = [];
      return p;
    },
    drainState() {
      return null;
    },
    drainFire() {
      return [];
    },
    drainSell() {
      return false;
    },
    drainRepair() {
      return false;
    },
    pushMessage(m: { serialize(): unknown[] }) {
      outgoing.push(m.serialize());
    },
    sendOutgoingMessages() {},
    outgoing,
  };
}

test('server answers a PING with a PONG echoing sentTime + server clock', () => {
  const conn = fakeConnection(1);
  conn.pings.push(555); // client sent-time awaiting a pong

  const world = { entities: new Map() } as any;
  const gameServer = { world, physics: {}, connectedClients: 0 } as any;
  const net = new NetworkServer(gameServer);
  net.connections = new Set([conn]) as any;

  net.processIncoming(world, 8000); // server clock = 8000

  assert.equal(conn.outgoing.length, 1);
  assert.deepEqual(conn.outgoing[0], [Types.Messages.PONG, 555, 8000]);
});
