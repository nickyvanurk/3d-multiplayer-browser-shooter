// The live lobby/player census behind GET /api/players. Kept free of express and
// the game loop so it stays a pure, testable mapping over the worlds list.

// The slice of a GameServer this census needs: its id, the real (non-bot) player
// count, and how many players it seats.
export interface WorldLike {
  id: string;
  connectedClients: number;
  maxClients: number;
}

export interface Lobby {
  id: string;
  players: number;
  capacity: number;
}

export interface PlayersPayload {
  players: number;
  lobbies: Lobby[];
}

// Every lobby with its current player count and seat capacity, plus the grand
// total across all worlds. Bots are excluded — connectedClients counts only real
// WebSocket players.
export function computePlayers(worlds: WorldLike[]): PlayersPayload {
  const lobbies = worlds.map((w) => ({
    id: w.id,
    players: w.connectedClients,
    capacity: w.maxClients,
  }));
  const players = lobbies.reduce((total, lobby) => total + lobby.players, 0);
  return { players, lobbies };
}
