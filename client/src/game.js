import { World } from 'ecsy';

import { Connection } from '../../shared/components/connection';
import { NetworkSystem } from './systems/network-system';

export default class Game {
  constructor() {
    this.lastTime = performance.now();

    this.world = new World();

    this.init();
  }

  init() {
    this.ws = new WebSocket(`ws://${process.env.SERVER_URL}:${process.env.PORT}`);
    this.ws.onopen = this.handleConnect.bind(this);
    this.ws.onclose = this.handleDisconnect.bind(this);

    this.world
      .registerComponent(Connection)
      .registerSystem(NetworkSystem);
  }

  run() {
    let time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.world.execute(delta, time);
    
    this.lastTime = time;

    requestAnimationFrame(this.run.bind(this));
  }

  handleConnect() {
    console.log(`Connected to server ${process.env.SERVER_URL}:${process.env.PORT}`);
    
    this.world.createEntity().addComponent(Connection, { id: null, ws: this.ws });
  }

  handleDisconnect() {
    console.log('Disconnected from server');
  }
}

