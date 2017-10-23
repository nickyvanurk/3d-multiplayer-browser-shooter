const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const THREE = require('three');

const app = express();

app.use(express.static('public'));

class Entity {
  constructor(size) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshLambertMaterial({color: 0xff0000})
    );
  }
}

class Player extends Entity {
  constructor() {
    super(new THREE.Vector3(1, 1, 1));

    this.speed = 8; // units/s
    this.rotationSpeed = 2;
    this.health = 100;
    this.alive = true;

    this.shootInterval = 100; // milliseconds
    this.canShoot = true;
  }

  applyInput(input) {
    if ((input.keys & 1) == 1) this.mesh.translateZ(-this.speed * input.pressTime);
    if ((input.keys & 2) == 2) this.mesh.rotation.y += this.rotationSpeed * input.pressTime;
    if ((input.keys & 4) == 4) this.mesh.rotation.y -= this.rotationSpeed * input.pressTime;
  }

  spawn() {
    this.mesh.position.x = Math.floor(Math.random() * 41) - 20;
    this.mesh.position.y = this.mesh.geometry.parameters.height / 2;
    this.mesh.position.z = Math.floor(Math.random() * 41) - 20;

    this.mesh.rotation.y = Math.random() * 361 * Math.PI / 180;
  }

  reset() {
    this.canShoot = true;
    this.health = 100;
    this.alive = true;
  }

  respawn() {
    this.reset();
    this.spawn();
  }
}

class Bullet extends Entity {
  constructor(playerId, position, rotation) {
    super(new THREE.Vector3(0.2, 0.2, 0.2));
    this.playerId = playerId;

    this.speed = 20;
    this.damage = 10;

    this.alive = true;

    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  update(dt) {
    this.mesh.translateZ(-this.speed * dt);
  }

  isColliding(object) {
    let a = new THREE.Box3().setFromObject(this.mesh);
    let b = new THREE.Box3().setFromObject(object.mesh);
    return a.intersectsBox(b);
  }
}

class Server {
  constructor(app) {
    this.httpServer = http.createServer(app);
    this.wss = new WebSocket.Server({server: this.httpServer});

    this.wss.on('connection', this.onConnection.bind(this));

    this.clients = {};
    this.players = {};
    this.bullets = {};

    this.lastProcessedInput = [];

    this.respawnTime = 1000; // milliseconds

    this.setUpdateRate(20);
  }

  onConnection(client) {
    client.id = this.getAvailableId(this.clients);
    this.clients[client.id] = client;
    this.broadcastMessage('System', 'orange', `Client #${client.id} connected`, +new Date());

    this.sendClientId(client);

    let player = new Player();
    player.id = client.id;
    player.spawn();
    this.players[player.id] = player;

    client.on('message', function (msg) {
      this.processInputs(msg, client);
    }.bind(this));

    client.on('close', () => {
      delete this.clients[client.id];
      delete this.players[client.id];

      this.broadcastClientDisconnect(client);
      this.broadcastMessage('System', 'orange', `Client #${client.id} disconnected`, +new Date());
    });
  }

  validateInput(input, clientId) {
    return clientId === input.id && input.pressTime < 1 / 40;
  }

  processInputs(msg, client) {
    let message = JSON.parse(msg);

    let input = {
      id: message[0],
      pressTime: message[1],
      inputSequenceNumber: message[2],
      keys: message[3]
    };

    if (this.validateInput(input, client.id)) {
      let player = this.players[input.id];

      if (!player.alive) return;

      player.applyInput(input);
      this.lastProcessedInput[input.id] = input.inputSequenceNumber;

      if ((input.keys & 8) == 8) { // shoot
        if (player.canShoot) {
          player.canShoot = false;
          let bulletId = this.getAvailableId(this.bullets);
          let bullet = new Bullet(player.id, player.mesh.position, player.mesh.rotation);

          this.bullets[bulletId] = bullet;
          this.broadcastBulletSpawn(bullet, bulletId, input.id);

          setTimeout(() => {
            delete this.bullets[bulletId];

            if (bullet.alive) {
              this.broadcastBulletDestroy(bulletId);
            }
          }, 2000);

          setTimeout(() => {
            player.canShoot = true;
          }, player.shootInterval);
        }
      }
    }
  }

  getAvailableId(object) {
    for (let i = 0; i < Object.keys(object).length; i++) {
      if (!object.hasOwnProperty(i)) return i;
    }

    return Object.keys(object).length;
  }


  sendClientId(client) {
    client.send(JSON.stringify({type: 'id', id: client.id}));
  }

  broadcastClientDisconnect(client) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify({
          type: 'disconnect',
          id: client.id
        }));
      }
    }
  }

  broadcastBulletSpawn(bullet, bulletId, playerId) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify({
          type: 'bulletSpawn',
          id: bulletId,
          playerId: playerId,
          position: {
            x: bullet.mesh.position.x,
            y: bullet.mesh.position.y,
            z: bullet.mesh.position.z,
          },
          rotation: {
            x: bullet.mesh.rotation.x,
            y: bullet.mesh.rotation.y,
            z: bullet.mesh.rotation.z,
          }
        }));
      }
    }
  }

  broadcastBulletDestroy(id) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify({
          type: 'bulletDestroy',
          id: id
        }));
      }
    }
  }

  broadcastMessage(author, color, msg, time) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify({
          type: 'message',
          author: author,
          color: color,
          content: msg,
          time: time
        }));
      }
    }
  }

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  update() {
    for (let bulletId in this.bullets) {
      let bullet = this.bullets[bulletId];

      if (!bullet.alive) continue;

      bullet.update(1 / this.updateRate);

      for (let key in this.clients) {
        let player = this.players[this.clients[key].id];

        if (bullet.playerId == player.id) continue;

        if (bullet.isColliding(player)) {
          if (player.alive) {
            player.health -= bullet.damage;
          }

          if (player.health == 0 && player.alive) {
            player.alive = false;

            setTimeout(() => {
              player.respawn();
            }, this.respawnTime);
          }

          bullet.alive = false;
          this.broadcastBulletDestroy(bulletId);
        }
      }
    }

    this.sendWorldState();
  }

  sendWorldState() {
    let worldState = [];
    for (let key in this.clients) {
      let client = this.clients[key];
      let player = this.players[client.id];

      worldState.push({
        id: player.id,
        position: {
          x: player.mesh.position.x,
          y: player.mesh.position.y,
          z: player.mesh.position.z
        },
        rotation: {
          x: player.mesh.rotation.x,
          y: player.mesh.rotation.y,
          z: player.mesh.rotation.z
        },
        lastProcessedInput: this.lastProcessedInput[client.id],
        health: player.health,
        //bullets: bullets
      });
    }

    //console.log(getUTF8Size(JSON.stringify(worldState)));

    for (const key in this.clients) {
      const client = this.clients[key];
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'worldState',
          states: worldState
        }));
      }
    }
  }

  listen(port) {
    this.httpServer.listen(port, () => {
      console.log('listening on %d', this.httpServer.address().port);
    });
  }
}

const server = new Server(app);
server.listen(8080);


/* Helpers */
function getUTF8Size(str) {
  var sizeInBytes = str.split('')
    .map(function (ch) {
      return ch.charCodeAt(0);
    }).map(function( uchar ) {
      return uchar < 128 ? 1 : 2;
    }).reduce(function (curr, next) {
      return curr + next;
    });

  return sizeInBytes;
};