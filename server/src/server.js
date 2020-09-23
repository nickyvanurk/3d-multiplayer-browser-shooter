import WebSocket from 'ws';

import logger from './utils/logger';
import World from './world';

export class Server {
  constructor() {
    this.worlds = [];
    this.connectionQueue = [];
    this.updatesPerSecond = 10;
    
    this.init();
  }

  init() {
    const port = +process.env.PORT || 1337;
    const wss = new WebSocket.Server({ port });
    logger.info(`Listening on port ${port}`);
    
    wss.on('connection', this.handleConnect.bind(this));
    
    for (let i = 0; i < process.env.WORLDS; ++i) {
      const world = new World(`world${i}`, process.env.PLAYERS_PER_WORLD, wss);
      world.run();
      this.worlds.push(world);
    }
  }

  run() {
    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);

    if (this.connectionQueue.length) {
      const ws = this.connectionQueue[0];

      if (ws.readyState !== WebSocket.OPEN) {
        return this.connectionQueue.shift();
      }

      if (this.tryAddConnectionToWorld(ws)) {
        this.connectionQueue.shift();
      }
    }
  }
  
  handleConnect(ws) {
    logger.info('New connection');

    if (!this.tryAddConnectionToWorld(ws)) {
      this.connectionQueue.push(ws);
      logger.info('Connection enqueued: worlds are full');
    }
  }

  tryAddConnectionToWorld(ws) {
    for (const world of this.worlds) {
      if (world.connectionCount < world.maxConnections) {
        world.addConnection(ws);
        return true;
      }
    }
    
    return false;
  }
}

