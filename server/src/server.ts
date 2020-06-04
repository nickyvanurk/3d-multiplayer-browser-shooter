import logger from './utils/logger';
import { World } from 'ecsy';

import { NetworkSystem } from './systems/network-system';

export class Server {
  private world: World;

  constructor() {
    this.world = new World();

    this.init();
  }

  init() {
    this.world.registerSystem(NetworkSystem);
  }
}
