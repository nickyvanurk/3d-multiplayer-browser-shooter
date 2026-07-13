import assert from 'node:assert/strict';
import { computePlayers } from '../../server/src/players-api.ts';
import { test } from './harness.ts';

test('computePlayers reports each lobby, its player count, and the grand total', () => {
  const worlds = [
    { id: 'world0', connectedClients: 2, maxClients: 20 },
    { id: 'world1', connectedClients: 0, maxClients: 20 },
    { id: 'world2', connectedClients: 5, maxClients: 20 },
  ];

  const payload = computePlayers(worlds);

  assert.equal(payload.players, 7);
  assert.deepEqual(payload.lobbies, [
    { id: 'world0', players: 2, capacity: 20 },
    { id: 'world1', players: 0, capacity: 20 },
    { id: 'world2', players: 5, capacity: 20 },
  ]);
});

test('computePlayers is empty with no worlds', () => {
  const payload = computePlayers([]);
  assert.equal(payload.players, 0);
  assert.deepEqual(payload.lobbies, []);
});
