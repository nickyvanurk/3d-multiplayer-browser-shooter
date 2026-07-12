export const Messages = {
  GO: 0,
  HELLO: 1,
  WELCOME: 2,
  SPAWN: 3,
  DESPAWN: 4,
  WORLD: 6,
  STATE: 7,
  FIRE: 8,
  // Mining economy. OREDROP (server->all): a chunk spawned at a position.
  // COLLECT (server->all): a chunk was collected, remove it. SELL/REPAIR
  // (client->server): vendor trade requests. STATS (server->owner): the owner's
  // cargo/credits changed.
  COLLECT: 9,
  SELL: 10,
  REPAIR: 11,
  STATS: 12,
  OREDROP: 13,
  // Clock sync. PING (client->server): client send time. PONG (server->client):
  // echoed send time + server clock. Feeds TimeSyncManager.
  PING: 14,
  PONG: 15,
  // Shop. BUY/EQUIP (client->server): purchase an item / (un)mount it in a weapon
  // slot. LOADOUT (server->owner): the owner's credits + item ownership + equipped
  // secondary after a change.
  BUY: 16,
  EQUIP: 17,
  LOADOUT: 18,
  // Client-side hit detection. FIRE (client->server) reports a muzzle so the
  // server can relay it as a cosmetic SHOT (server->others) to reproduce the
  // tracer. HIT (client->server): the shooter's raycast struck a target; the
  // server validates and applies the damage. Bullets no longer exist server-side
  // (except bots').
  HIT: 19,
  SHOT: 20,
} as const;

export const Entities = {
  SPACESHIP: 0,
  ASTEROID: 1,
  BULLET: 2,
  VENDOR: 3,
} as const;

export type MessageId = (typeof Messages)[keyof typeof Messages];
export type EntityKind = (typeof Entities)[keyof typeof Entities];

export default { Messages, Entities };
