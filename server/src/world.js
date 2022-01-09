import logger from './utils/logger';

export default class World {
  constructor(id, maxPlayers) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.currentPlayers = 0;
    this.players = {};

    logger.info(`World #${this.id} created`);
  }

  addPlayer(client) {
    this.players[client.id] = {};
    this.currentPlayers++;

    logger.debug(`World #${this.id}: add player for client #${client.id}`);
  }

  removePlayer(client) {
    if (!this.players[client.id]) {
      return false;
    }

    delete this.players[client.id];
    this.currentPlayers--;

    logger.debug(`World #${this.id}: remove player for client #${client.id}`);

    return true;
  }
}
