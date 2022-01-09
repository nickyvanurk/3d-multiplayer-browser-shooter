require('dotenv').config();

import logger from './utils/logger';
import Server from './server';

const server = new Server(+process.env.PORT || 1337, +process.env.MAX_PLAYERS);

server.onConnection((_connection) => {
});
