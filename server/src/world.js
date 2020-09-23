import { performance } from 'perf_hooks';
import logger from './utils/logger';

export default class World {
  constructor(id, maxConnections, server) {
    this.id = id;
    this.maxConnections = maxConnections;
    this.server = server;
    this.updatesPerSecond = 10;
    this.lastTime = performance.now();

    this.connectionCount = 0;
    
    logger.log(`${this.id} running`);
  }
  
  run() {
    setTimeout(this.run.bind(this), 1000/this.updatesPerSecond);

    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }
    
    this.lastTime = time;
  }

  addConnection(ws) {
    logger.log(`Adding client to ${this.id}`);
    ws.on('close', this.handleDisconnect.bind(this));
    this.connectionCount++;
  }

  handleDisconnect() {
    logger.log('Client disconnect');
    this.connectionCount--;
  }
}
