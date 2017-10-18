const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');

const app = express();

app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({server});

wss.on('connection', (ws, req) => {
  ws.on('message', (message) => {
    console.log('received: %s', message);
  });

  ws.on('close', () => {
    console.log('client disconnected');
  });

  ws.send('something');
});

server.listen(8080, () => {
  console.log('listening on %d', server.address().port);
});
