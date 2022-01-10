import Client from './client';

const logger = console;
const client = new Client();

client.onConnect(() => {
  logger.debug('Connected');
});

client.onDisconnect(() => {
  logger.debug('Disconnected');
});

client.onMessage((message) => {
  logger.debug(`Msg: ${message}`);
});
