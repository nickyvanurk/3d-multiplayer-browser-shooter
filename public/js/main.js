const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('connected');
  ws.send('client message');
};

ws.onmessage = (message) => {
  console.log(message);
};