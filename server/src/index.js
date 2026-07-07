import dotenv from 'dotenv';

import logger from './utils/logger.js';
import Server from './server.js';
import { GameServer } from './game-server.js';

dotenv.config();

function main() {
  const server = new Server(+process.env.PORT || 1337, process.env.MAX_PLAYERS);
  const worlds = [];

  server.onConnection((connection) => {
    logger.debug('New connection');
    
    for (const world of worlds) {
      if (world.connectedClients < world.maxClients) {
        world.handlePlayerConnect(connection);
        return;
      }
    }
  });

  server.onError((error) => {
    logger.error(error);
  });

  for (let i = 0; i < process.env.WORLDS; ++i) {
    const world = new GameServer(`world${i}`, process.env.PLAYERS_PER_WORLD, server);
    world.init();
    worlds.push(world);
  }
}

main();
