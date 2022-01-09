require('dotenv').config();
import express from 'express';
import path from 'path';

import logger from './utils/logger';

const app = express();

if (process.env.PRODUCTION) {
  app
    .use(express.static(path.join(__dirname, '../../client/public')))
    .get('*', (_req, res) => res.sendFile(path.join(__dirname, '../../client/public/index.html')));
}

app.listen(3000, () => logger.info('Server listening on port 3000!'));
