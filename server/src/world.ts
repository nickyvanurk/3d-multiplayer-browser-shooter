import logger from './utils/logger';
import { Server, Session } from './server';

export default class World {
  public maxPlayers: number;
  public playerCount: number;

  private server: Server;
  private updatesPerSecond: number;
  private bounds: Vector3;

  constructor(maxPlayers: number, server: Server) {
    this.maxPlayers = maxPlayers;
    this.playerCount = 0;
    this.server = server;
    this.updatesPerSecond = 60;
    this.bounds = { x: 1000, y: 1000, z: 1000 };
  }

  run() {
    setInterval(() => {
      this.update();
    }, 1000 / this.updatesPerSecond);

    logger.info(`world created (capacity: ${this.maxPlayers} players).`);
  }

  update() {

  }

  addPlayer(session: Session) {
    const pos = this.randomStartingPosition;
    logger.info(`creating player at position x: ${pos.x}, y: ${pos.y}, z: ${pos.z}`);

    this.playerCount++;
  }

  get randomStartingPosition() : Vector3 {
    return {
      x: Math.floor(Math.random() * (this.bounds.x - 1)) + 1,
      y: Math.floor(Math.random() * (this.bounds.x - 1)) + 1,
      z: Math.floor(Math.random() * (this.bounds.x - 1)) + 1
    }
  }
}

type Vector3 = {
  x: number,
  y: number,
  z: number
};
