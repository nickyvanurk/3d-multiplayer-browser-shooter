import logger from './utils/logger';

export default class World {
  constructor(id, maxPlayers) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.currentPlayers = 0;
    this.players = {};
  }

  join(client) {
    const playerId = client.id;

    if (!this.createPlayer(playerId)) {
      logger.error(`World#${this.id}: can't create player#${playerId}`);
      return false;
    }

    logger.debug(`World#${this.id}: create player#${playerId}`);

    return true;
  }

  leave(client) {
    const playerId = client.id;

    if (!this.destroyPlayer(playerId)) {
      logger.error(`World#${this.id}: can't destroy player#${playerId}`);
      return false;
    }

    logger.debug(`World#${this.id}: destroy player#${playerId}`);

    return true;
  }

  createPlayer(id) {
    if (this.players[id]) {
      return false;
    }

    this.players[id] = {};
    this.currentPlayers++;

    return true;
  }

  destroyPlayer(id) {
    if (!this.players[id]) {
      return false;
    }

    delete this.players[id];
    this.currentPlayers--;

    return true;
  }

  isFull() {
    return this.currentPlayers == this.maxPlayers;
  }
}
