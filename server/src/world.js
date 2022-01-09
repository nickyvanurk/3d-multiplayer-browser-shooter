import logger from './utils/logger';

export default class World {
  constructor(id, maxPlayers) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.currentPlayers = 0;
    this.players = {};

    logger.info(`World #${this.id} created`);
  }

  addPlayer(connection) {
    this.players[connection.id] = {};
    this.currentPlayers++;

    logger.debug(`World #${this.id}: add player for client #${connection.id}`);
  }

  removePlayer(connection) {
    if (!this.players[connection.id]) {
      return false;
    }

    delete this.players[connection.id];
    this.currentPlayers--;

    logger.debug(`World #${this.id}: remove player for client #${connection.id}`);

    return true;
  }
}
