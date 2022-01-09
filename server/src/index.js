require('dotenv').config();

import Server from './server';
import World from './world';

const server = new Server(+process.env.PORT || 1337, +process.env.MAX_PLAYERS);
const worlds = [];

for (let i = 0; i < process.env.WORLDS; ++i) {
  worlds.push(new World(i, +process.env.PLAYERS_PER_WORLD));
}

server.onClientConnect((client) => {
  for (const world of worlds) {
    if (world.currentPlayers < world.maxPlayers) {
      world.addPlayer(client);
      return;
    }
  }

  // TODO: Send worlds full message to client
});

server.onClientDisconnect((client) => {
  for (const world of worlds) {
    if (world.removePlayer(client)) {
      return;
    }
  }
});
