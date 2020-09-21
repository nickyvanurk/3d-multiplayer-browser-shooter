import { performance } from 'perf_hooks';
import { World } from 'ecsy';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import logger from './utils/logger';

export class Server {
  constructor() {
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

    this.worlds = [];
    this.worlds.push(new World());
    this.worlds.push(new World());
    
    this.init();
  }

  init() {
    const port = +process.env.PORT || 1337;
    const wss = new WebSocket.Server({ port });
    logger.info(`Listening on port ${ port }`);
    
    wss.on('connection', this.handleConnect);
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    for (const world of this.worlds) {
      world.execute(delta, time);
    }
    
    this.lastTime = time;

    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);
  }
  
  handleConnect() {
    logger.info('New connection');

    // check world population; get world that is not full
    // create connection component?
  }
}

