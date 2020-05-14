import geckos from '@geckos.io/server';
import logger from './utils/logger';

const io = geckos();

io.listen(parseInt(process.env.PORT || '3000'));

io.onConnection(channel => {
  logger.info(`Client connected`);

  channel.onDisconnect(() => {
    logger.info(`Client disonnected`);
  })

  channel.on('chat message', (data: any) => {
    logger.info(`Client message: ${data}`);
    io.room(channel.roomId).emit('chat message', data);
  })
});
