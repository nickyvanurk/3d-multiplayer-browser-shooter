import Client from './client';
import Game from './game';

const logger = console;
const client = new Client();
const game = new Game();

game.createPlayer();

client.onConnect(() => {
  logger.debug('Connected');
});

client.onDisconnect(() => {
  logger.debug('Disconnected');
});

client.onMessage((message) => {
  logger.debug(`Msg: ${message}`);
});
