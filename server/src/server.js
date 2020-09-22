import { performance } from 'perf_hooks';
import { World } from 'ecsy';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import logger from './utils/logger';

import { Connection } from './components/connection';
import { NetworkSystem } from './systems/network-system';

export class Server {
  constructor() {
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

    this.worlds = [];
    this.worlds.push(new World());
    this.worlds.push(new World());

    this.connectionQueue = [];
    
    this.init();
  }

  init() {
    const port = +process.env.PORT || 1337;
    const wss = new WebSocket.Server({ port });
    logger.info(`Listening on port ${port}`);
    
    wss.on('connection', this.handleConnect.bind(this));
    
    for (const world of this.worlds) {
      world
        .registerComponent(Connection)
        .registerSystem(NetworkSystem);
    }
  }

  run() {
    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);

    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    if (this.connectionQueue.length) {
      const ws = this.connectionQueue[0];

      if (ws.readyState !== WebSocket.OPEN) {
        return this.connectionQueue.shift();
      }

      if (this.tryAddConnectionToWorld(ws)) {
        this.connectionQueue.shift();
      }
    }

    for (const world of this.worlds) {
      world.execute(delta, time);
    }
    
    this.lastTime = time;
  }
  
  handleConnect(ws) {
    logger.info('New connection');

    if (!this.tryAddConnectionToWorld(ws)) {
      this.connectionQueue.push(ws);
      logger.info('Connection enqueued: worlds are full');
    }
  }

  tryAddConnectionToWorld(ws) {
    for (const [index, world] of this.worlds.entries()) {
      const connections = world.componentsManager.numComponents[Connection._typeId];

      if (connections < process.env.PLAYERS_PER_WORLD) {
        const id = uuidv4();
        
        world.createEntity().addComponent(Connection, { id, ws });
        logger.info(`Player ${id} entered world ${index}`);

        return true;
      }
    }
    
    return false;
  }
}

