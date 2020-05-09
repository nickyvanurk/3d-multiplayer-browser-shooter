import geckos from '@geckos.io/server';

const io = geckos();

io.listen(parseInt(process.env.PORT || '3000'));

io.onConnection(channel => {
  channel.onDisconnect(() => {
    console.log(`${channel.id} got disconnected`);
  })

  channel.on('chat message', (data: any) => {
    console.log(`received: ${data}`);
    // emit the "chat message" data to all channels in the same room
    io.room(channel.roomId).emit('chat message', data);
  })
});
