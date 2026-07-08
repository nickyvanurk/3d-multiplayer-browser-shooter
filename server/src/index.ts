import dotenv from 'dotenv';

import logger from './utils/logger.ts';
import Server from './server.ts';
import { GameServer } from './game-server.ts';

dotenv.config();

function main() {
  const server = new Server(
    +process.env.PORT! || 1337,
    process.env.MAX_PLAYERS as unknown as number,
  );
  const worlds: GameServer[] = [];

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

  for (let i = 0; i < Number(process.env.WORLDS); ++i) {
    const world = new GameServer(
      `world${i}`,
      Number(process.env.PLAYERS_PER_WORLD),
      server,
    );
    world.init();
    worlds.push(world);
  }
}

main();
