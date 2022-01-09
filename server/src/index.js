require('dotenv').config();
import logger from './utils/logger';

import Server from './server';
import World from './world';

const server = new Server(+process.env.PORT || 1337, +process.env.MAX_PLAYERS);
const worlds = [];

for (let i = 0; i < process.env.WORLDS; ++i) {
  worlds.push(new World(i, +process.env.PLAYERS_PER_WORLD));
}

logger.info(`Worlds created: ${worlds.length}`);

server.onClientConnect((client) => {
  for (const world of worlds) {
    if (!world.isFull()) {
      if (world.join(client)) {
        client.worldId = world.id;
        logger.info(`Client#${client.id} joined world#${world.id}`);
        return;
      } else {
        logger.error(`Client#${client.id} failed to join world#${world.id}`);
      }
    }
  }

  // TODO: Send worlds full message to client
});

server.onClientDisconnect((client) => {
  if (!worlds[client.worldId]) {
    return;
  }

  if (worlds[client.worldId].leave(client)) {
    logger.info(`Client#${client.id} left world#${client.worldId}`);
  } else {
    logger.error(`Client#${client.id} failed to leave world#${client.worldId}`);
  }
});
