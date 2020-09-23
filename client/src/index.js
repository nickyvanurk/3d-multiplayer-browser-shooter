import './style.css';
import Connection from './connection';
import Game from './game';

function main() {
  const connection = new Connection(process.env.SERVER_URL, +process.env.PORT || 1337);
  const game = new Game();

  game.run();
  
  connection.onConnection(() => {
    console.log('Connected to server');
    
    connection.onMessage((message) => {
      console.log(message);
      
      switch (message) {
        case 'go':
          connection.send([0, null, 'Nicky']);
          break;
      }
    });
  });

  connection.onDisconnect(() => {
    console.log('Disconnected from server');
  });

  connection.onError((error) => {
    console.log(error);
  });
}

main();
