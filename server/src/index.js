import dotenv from 'dotenv';

import logger from './utils/logger';
import Server from './server';
import World from './world';

dotenv.config();

function main() {
  const server = new Server(+process.env.PORT || 1337);
  const worlds = [];

  server.onConnection((connection) => {
    logger.debug('New connection');
    
    for (const world of worlds) {
      if (world.playerCount < world.maxPlayers) {
        world.handlePlayerConnect(connection);
        return;
      }
    }
  });

  server.onError((error) => {
    logger.error(error);
  });

  for (let i = 0; i < process.env.WORLDS; ++i) {
    const world = new World(`world${i}`, process.env.PLAYERS_PER_WORLD, server);
    world.init();
    worlds.push(world);
  }
}

main();
