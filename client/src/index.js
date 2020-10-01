import './style.css';
import Connection from './connection';
import Game from './game';

function main() {
  const connection = new Connection(process.env.SERVER_URL, +process.env.PORT || 1337);
  const game = new Game();

  game.init();
  
  connection.onConnection(() => {
    console.log('Connected to server');
    game.handleConnect(connection);
  });

  connection.onDisconnect(() => {
    console.log('Disconnected from server');
  });

  connection.onError((error) => {
    console.log(error);
  });
}

main();
