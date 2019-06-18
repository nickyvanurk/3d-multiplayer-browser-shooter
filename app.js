const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Quaternion = require('quaternion');

const port = process.env.PORT || 3000;

const app = express();

app.use(express.static('public'));

class Vector3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class Entity {
  constructor(size) {
    this.position = new Vector3(0, 0, 0);
    this.rotation = new Quaternion();

    this.size = size;

    this.color = 0xFF0000;
  }
}

class Player extends Entity {
  constructor() {
    super(new Vector3(4, 1.5, 3));

    this.speed = 8; // units/s
    this.rotationSpeed = 2;
    this.health = 100;
    this.alive = true;
    this.kills = 0;

    this.shootInterval = 100; // milliseconds
    this.canShoot = true;

    this.speed = 0.1 * 0.016;
    this.maxSpeed = 40 * 0.016;
    this.minSpeed = 0.1 * 0.016;
    this.acceleration = 0.1 * 0.016;
    this.maxAcceleration = 10 * 0.016;

    this.rollSpeed = 0;
    this.maxRollSpeed = 1 * 0.016;
    this.minRollSpeed = 0;
    this.rollAccel = 0.02 * 0.016;
    this.maxRollAccel = 0.5 * 0.016;

    this.yawSpeed = 0.6 * 0.016;
    this.pitchSpeed = 0.6 * 0.016;

    this.forward = 0;
    this.rollLeft = 0;
    this.rollRight = 0;
    this.yaw = 0;
    this.pitch = 0;
  }

  update(dt) {
  }

  applyInput(input) {
    this.forward = ((input.keys & 1) == 1);
    this.rollLeft = ((input.keys & 2) == 2);
    this.rollRight = ((input.keys & 4) == 4);
    this.yaw = input.yaw || 0;
    this.pitch = input.pitch || 0;

    const rm = this.rotation.toMatrix();
    const uv = new Vector3(0, 0, 1);

    let direction = new Vector3();
    direction.x = rm[0]*uv.x + rm[1]*uv.y + rm[2]*uv.z;
    direction.y = rm[3]*uv.x + rm[4]*uv.y + rm[5]*uv.z;
    direction.z = rm[6]*uv.x + rm[7]*uv.y + rm[8]*uv.z;

    this.position.x += direction.x * -this.speed;
    this.position.y += direction.y * -this.speed;
    this.position.z += direction.z * -this.speed;

    if (this.forward) {
      this.speed += this.acceleration;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (this.speed > this.minSpeed) {
      this.speed -= this.acceleration;
      if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    }

    if (this.rollRight) {
      this.rollSpeed += this.rollAccel;
      if (this.rollSpeed > this.maxRollSpeed) this.rollSpeed = this.maxRollSpeed;
    }

    if (this.rollLeft) {
      this.rollSpeed -= this.rollAccel;
      if (this.rollSpeed < -this.maxRollSpeed) this.rollSpeed = -this.maxRollSpeed;
    }

    if (!this.rollLeft && !this.rollRight) {
      if (this.rollSpeed > this.minRollSpeed) {
        this.rollSpeed -= this.rollAccel;
        if (this.rollSpeed < this.minRollSpeed) this.rollSpeed = this.minRollSpeed;
      } else if (this.rollSpeed < -this.minRollSpeed) {
        this.rollSpeed += this.rollAccel;
        if (this.rollSpeed > -this.minRollSpeed) this.rollSpeed = -this.minRollSpeed;
      }
    }

    const tmpQuaternion = new Quaternion([
      1,
      -this.pitch * this.pitchSpeed,
      -this.yaw * this.yawSpeed,
      -this.rollSpeed
    ]).normalize();

    this.rotation = this.rotation.mul(tmpQuaternion);
  }

  spawn() {
    this.position = new Vector3(
      Math.floor(Math.random() * 41) - 20,
      Math.floor(Math.random() * 41) - 20,
      Math.floor(Math.random() * 41) - 20
    );

    this.rotation = new Quaternion.fromEuler(
      Math.random() * 361 * Math.PI / 180,
      Math.random() * 361 * Math.PI / 180,
      Math.random() * 361 * Math.PI / 180
    );
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
  constructor(playerId, position, rotation, velocity) {
    super(new Vector3(0.2, 0.2, 0.2));
    this.playerId = playerId;

    this.speed = 120 + velocity;
    this.damage = 10;

    this.alive = true;

    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;

    this.rotation.w = rotation.w;
    this.rotation.x = rotation.x;
    this.rotation.y = rotation.y;
    this.rotation.z = rotation.z;
  }

  update(dt) {
    const rm = this.rotation.toMatrix();
    const uv = new Vector3(0, 0, 1);

    let direction = new Vector3();
    direction.x = rm[0]*uv.x + rm[1]*uv.y + rm[2]*uv.z;
    direction.y = rm[3]*uv.x + rm[4]*uv.y + rm[5]*uv.z;
    direction.z = rm[6]*uv.x + rm[7]*uv.y + rm[8]*uv.z;

    this.position.x += direction.x * (-this.speed * dt);
    this.position.y += direction.y * (-this.speed * dt);
    this.position.z += direction.z * (-this.speed * dt);
  }

  isColliding(object) {
    const min_distance = 3;

    const distance = Math.sqrt(
      Math.pow(this.position.x - object.position.x, 2) +
      Math.pow(this.position.y - object.position.y, 2) +
      Math.pow(this.position.z - object.position.z, 2)
    );
    
    return distance < min_distance;

    // TODO: Due to removing Three.js code, collision detection is worse.
    // Rework it with the Separating Axis Theorem for 3D.
  }
}

class Server {
  constructor(app) {
    this.clients = {};
    this.players = {};
    this.bullets = {};

    this.colors = [
      '#ff0000',
      '#00ff00',
      '#d10042',
      '#c1acb3',
      '#e0cb14',
      '#ff443a',
      '#3c64c1',
      '#b83cc1'
    ];

    this.lastProcessedInput = [];

    this.respawnTime = 1000; // milliseconds

    this.setUpdateRate(40);
  }

  onConnection(client) {
    client.on('error', e => {}); // silence ECONNRESET error on browser refresh

    client.id = this.getAvailableId(this.clients);
    client.color = this.getRandomColor();
    this.clients[client.id] = client;

    let players = [];

    for (const key in this.clients) {
      const client = this.clients[key];

      if (!client.name) continue;

      const player = this.players[client.id];

      if (!player) continue;

      let playerPos = {x: player.position.x, y: player.position.y, z: player.position.z};
      let playerRot = {x: player.rotation.x, y: player.rotation.y, z: player.rotation.z, w: player.rotation.w};

      players.push({
        id: player.id,
        position: playerPos,
        rotation: playerRot,
        health: player.health,
        color: client.color,
        name: client.name,
        kills: player.kills
      });
    }

    let bullets = [];

    for (const key in this.bullets) {
      const bullet = this.bullets[key];

      if (!bullet) continue;

      let bulletPos = {x: bullet.position.x, y: bullet.position.y, z: bullet.position.z};
      let bulletRot = {x: bullet.rotation.x, y: bullet.rotation.y, z: bullet.rotation.z};

      bullets.push({id: key, playerId: bullet.playerId, position: bulletPos, rotation: bulletRot});
    }


    client.send(JSON.stringify({
      type: 'initWorld',
      players: players,
      bullets: bullets
    }));

    client.on('message', function (message) {
      if (typeof message === 'string') {
        let msg = JSON.parse(message);

        if (msg.type === 'setName' && !client.name) {
          let player = new Player();
          player.id = client.id;
          player.spawn();
          this.players[player.id] = player;

          let name = msg.name;
          if (name.length > 15) {
            name = name.substring(0, 15);
          }
          client.name = name;
          client.send(JSON.stringify({type: 'initClient', id: client.id, color: client.color}));

          this.broadcastPlayerSpawn(client);
          this.broadcastMessage('System', 'orange', `${client.name} joined the game!`, +new Date());
        } else if (msg.type === 'msg') {
          this.broadcastMessage(client.name, client.color, msg.content, msg.time);
        }
      } else {
        this.processInputs(message, client);
      }
    }.bind(this));

    client.on('close', () => {
      delete this.clients[client.id];
      delete this.players[client.id];

      this.broadcast({type: 'removePlayer', id: client.id});

      if (client.name) {
        this.broadcastMessage('System', 'orange', `${client.name} left the game.`, +new Date());
      }
    });
  }

  processInputs(message, client) {
    const arrayBuffer = message.buffer.slice(
      message.byteOffset,
      message.byteOffset + message.byteLength
    );

    var array = new Float32Array(arrayBuffer);

    let input = {
      id: array[1],
      pressTime: array[2],
      inputSequenceNumber: array[3],
      keys: array[4],
      yaw: array[5],
      pitch: array[6]
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
          let bullet = new Bullet(player.id, player.position, player.rotation, player.speed);

          this.bullets[bulletId] = bullet;
          this.broadcastBulletSpawn(bullet, bulletId, input.id);

          setTimeout(() => {
            delete this.bullets[bulletId];

            if (bullet.alive) {
              this.broadcast({type: 'removeBullet', id: bulletId});
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
    for (let key in this.players) {
      this.players[key].update(1 / this.updateRate);
    }

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
            player.kills = 0;
            this.players[bullet.playerId].kills++;

            setTimeout(() => {
              player.respawn();
            }, this.respawnTime);
          }

          bullet.alive = false;
          this.broadcast({type: 'removeBullet', id: bulletId});
        }
      }
    }

    this.sendWorldState();
  }

  sendWorldState() {
    let worldState = [];
    for (let id in this.players) {
      let player = this.players[id];

      let playerPos = {x: player.position.x, y: player.position.y, z: player.position.z};
      let playerRot = {x: player.rotation.x, y: player.rotation.y, z: player.rotation.z, w: player.rotation.w};

      worldState.push([player.id, playerPos, playerRot, this.lastProcessedInput[id], player.health,
        player.speed, player.rollSpeed, player.yaw, player.pitch, player.kills]);
    }

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

        let playerPos = {x: player.position.x, y: player.position.y, z: player.position.z};
        let playerRot = {x: player.rotation.x, y: player.rotation.y, z: player.rotation.z, w: player.rotation.w};

        this.clients[key].send(JSON.stringify({
          type: 'addPlayer',
          id: player.id,
          position: playerPos,
          rotation: playerRot,
          health: player.health,
          color: client.color,
          name: client.name,
          kills: player.kills
        }));
      }
    }
  }

  broadcastBulletSpawn(bullet, bulletId, playerId) {
    let bulletPos = {x: bullet.position.x, y: bullet.position.y, z: bullet.position.z};
    let bulletRot = {x: bullet.rotation.x, y: bullet.rotation.y, z: bullet.rotation.z, w: bullet.rotation.w};
    this.broadcast({type: 'addBullet', id: bulletId, playerId: playerId, position: bulletPos, rotation: bulletRot});
  }

  broadcastMessage(author, color, msg, time) {
    this.broadcast({
      type: 'message',
      author: this.htmlEntities(author),
      color:  this.htmlEntities(color),
      content: this.htmlEntities(msg),
      time: Number.isInteger(time) ? time : 0
    });
  }

  htmlEntities(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  getRandomColor() {
    let color = this.colors.shift();
    this.colors.push(color);
    return color;
  }
}

const gameServer = new Server(app);
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({server: httpServer});

wss.on('connection', gameServer.onConnection.bind(gameServer));

httpServer.listen(port, () => {
  console.log('listening on %d', port);
});
