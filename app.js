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
    client.color = this.getRandomColor();
    this.clients[client.id] = client;
    client.send(JSON.stringify({type: 'id', id: client.id}));

    let players = [];

    for (const key in this.clients) {
      const client = this.clients[key];

      if (!client.name) continue;

      const player = this.players[client.id];

      if (!player) continue;

      let playerPos = {x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z};
      let playerRot = {x: player.mesh.rotation.x, y: player.mesh.rotation.y, z: player.mesh.rotation.z};

      players.push({
        id: player.id,
        position: playerPos,
        rotation: playerRot,
        health: player.health,
        color: client.color,
        name: client.name
      });
    }

    let bullets = [];

    for (const key in this.bullets) {
      const bullet = this.bullets[key];

      if (!bullet) continue;

      let bulletPos = {x: bullet.mesh.position.x, y: bullet.mesh.position.y, z: bullet.mesh.position.z};
      let bulletRot = {x: bullet.mesh.rotation.x, y: bullet.mesh.rotation.y, z: bullet.mesh.rotation.z};

      bullets.push({id: key, playerId: bullet.playerId, position: bulletPos, rotation: bulletRot});
    }

    client.send(JSON.stringify({
      type: 'init',
      id: client.id,
      color: client.color,
      players: players,
      bullets: bullets
    }));

    client.on('message', function (message) {
      let msg = JSON.parse(message);

      if (msg.type === 'setName' && !client.name) {
        let player = new Player();
        player.id = client.id;
        player.spawn();
        this.players[player.id] = player;

        client.name = msg.name;
        client.color = this.getRandomColor();
        client.send(JSON.stringify({type: 'color', color: client.color}));

        this.broadcastPlayerSpawn(client);
        this.broadcastMessage('System', 'orange', `${client.name} joined the game!`, +new Date());
      } else if (msg.type === 'msg') {
        this.broadcastMessage(client.name, client.color, msg.content, msg.time);
      } else {
        this.processInputs(msg, client);
      }
    }.bind(this));

    client.on('close', () => {
      delete this.clients[client.id];
      delete this.players[client.id];

      this.broadcast({type: 'disconnect', id: client.id});

      if (client.name) {
        this.broadcastMessage('System', 'orange', `${client.name} left the game.`, +new Date());
      }
    });
  }

  processInputs(msg, client) {
    let input = {
      id: msg[0],
      pressTime: msg[1],
      inputSequenceNumber: msg[2],
      keys: msg[3]
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
              this.broadcast({type: 'bulletDestroy', id: bulletId});
            }
          }, 2000);

          setTimeout(() => {
            player.canShoot = true;
          }, player.shootInterval);
        }
      }
    }
  }

  update() {
    for (let bulletId in this.bullets) {
      let bullet = this.bullets[bulletId];

      if (!bullet.alive) continue;

      bullet.update(1 / this.updateRate);

      for (let id in this.players) {
        let player = this.players[id];

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
          this.broadcast({type: 'bulletDestroy', id: bulletId});
        }
      }
    }

    this.sendWorldState();
  }

  sendWorldState() {
    let worldState = [];
    for (let id in this.players) {
      let player = this.players[id];

      let playerPos = {x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z};
      let playerRot = {x: player.mesh.rotation.x, y: player.mesh.rotation.y, z: player.mesh.rotation.z};

      worldState.push([player.id, playerPos, playerRot, this.lastProcessedInput[id], player.health]);
    }

    // console.log(getUTF8Size(JSON.stringify(worldState)));

    this.broadcast({type: 'worldState', states: worldState});
  }

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  validateInput(input, clientId) {
    return clientId === input.id && input.pressTime < 1 / 40;
  }

  getAvailableId(object) {
    for (let i = 0; i < Object.keys(object).length; i++) {
      if (!object.hasOwnProperty(i)) {
        return i;
      }
    }

    return Object.keys(object).length;
  }

  broadcast(object) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        this.clients[key].send(JSON.stringify(object));
      }
    }
  }

  broadcastPlayerSpawn(client) {
    for (const key in this.clients) {
      if (this.clients[key].readyState === WebSocket.OPEN) {
        let player = this.players[client.id];

        let playerPos = {x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z};
        let playerRot = {x: player.mesh.rotation.x, y: player.mesh.rotation.y, z: player.mesh.rotation.z};

        this.clients[key].send(JSON.stringify({
          type: 'spawnPlayer',
          id: player.id,
          position: playerPos,
          rotation: playerRot,
          health: player.health,
          color: client.color,
          name: client.name
        }));
      }
    }
  }

  broadcastBulletSpawn(bullet, bulletId, playerId) {
    let bulletPos = {x: bullet.mesh.position.x, y: bullet.mesh.position.y, z: bullet.mesh.position.z};
    let bulletRot = {x: bullet.mesh.rotation.x, y: bullet.mesh.rotation.y, z: bullet.mesh.rotation.z};
    this.broadcast({type: 'bulletSpawn', id: bulletId, playerId: playerId, position: bulletPos, rotation: bulletRot});
  }

  broadcastMessage(author, color, msg, time) {
    this.broadcast({
      type: 'message',
      author: author,
      color: color,
      content: msg,
      time: time
    });
  }

  getRandomColor() {
    return "#" + ("000000" + Math.floor(Math.random() * 16777216).toString(16)).substr(-6);
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