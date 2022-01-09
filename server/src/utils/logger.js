require('dotenv').config();
import { createLogger, format, transports as _transports } from 'winston';

const transports = {
  console: new _transports.Console({ level: process.env.LOG_LEVEL }),
};

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: format.combine(
    format.colorize(),
    format.simple()
  ),
  transports: [
    transports.console,
  ]
});

export default logger;
