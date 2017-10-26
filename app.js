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
    super(new THREE.Vector3(4, 1.5, 3));

    this.speed = 8; // units/s
    this.rotationSpeed = 2;
    this.health = 100;
    this.alive = true;

    this.shootInterval = 100; // milliseconds
    this.canShoot = true;

    this.speed = 0.1;
    this.maxSpeed = 40;
    this.minSpeed = 0.1;
    this.acceleration = 6;
    this.maxAcceleration = 10;

    this.rollSpeed = 0;
    this.maxRollSpeed = 2;
    this.minRollSpeed = 0;
    this.rollAccel = 3.6;
    this.maxRollAccel = 1;

    this.yawSpeed = 0;
    this.maxYawSpeed = 0.8;
    this.minYawSpeed = 0;
    this.yawAccel = 1.2;
    this.maxYawAccel = 1;

    this.pitchSpeed = 0.6;

    this.forward = 0;
    this.rollLeft = 0;
    this.rollRight = 0;
    this.yawLeft = 0;
    this.yawRight = 0;
    this.pitch = 0;

    this.tmpQuaternion = new THREE.Quaternion();
    this.rotationVector = new THREE.Vector3();
  }

  update(dt) {
  }

  applyInput(input) {
    this.forward = ((input.keys & 1) == 1);
    this.rollLeft = ((input.keys & 2) == 2);
    this.rollRight = ((input.keys & 4) == 4);
    this.yawLeft = ((input.keys & 16) == 16);
    this.yawRight = ((input.keys & 32) == 32);
    this.pitch = input.pitch || 0;

    this.mesh.translateZ(-this.speed * input.pressTime);

    this.rotationVector.x = -this.pitch;
    this.rotationVector.y = -this.yawRight + this.yawLeft;
    this.rotationVector.z = -this.rollRight + this.rollLeft;

    if (this.forward) {
      this.speed += this.acceleration * input.pressTime;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (this.speed > this.minSpeed) {
      this.speed -= this.acceleration * input.pressTime;
      if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    }

    if (this.rollRight) {
      this.rollSpeed += this.rollAccel * input.pressTime;
      if (this.rollSpeed > this.maxRollSpeed) this.rollSpeed = this.maxRollSpeed;
    }

    if (this.rollLeft) {
      this.rollSpeed -= this.rollAccel * input.pressTime;
      if (this.rollSpeed < -this.maxRollSpeed) this.rollSpeed = -this.maxRollSpeed;
    }

    if (!this.rollLeft && !this.rollRight) {
      if (this.rollSpeed > this.minRollSpeed) {
        this.rollSpeed -= this.rollAccel * input.pressTime;
        if (this.rollSpeed < this.minRollSpeed) this.rollSpeed = this.minRollSpeed;
      } else if (this.rollSpeed < -this.minRollSpeed) {
        this.rollSpeed += this.rollAccel * input.pressTime;
        if (this.rollSpeed > -this.minRollSpeed) this.rollSpeed = -this.minRollSpeed;
      }
    }

    if (this.yawRight) {
      this.yawSpeed += this.yawAccel * input.pressTime;
      if (this.yawSpeed > this.maxYawSpeed) this.yawSpeed = this.maxYawSpeed;
    }

    if (this.yawLeft) {
      this.yawSpeed -= this.yawAccel * input.pressTime;
      if (this.yawSpeed < -this.maxYawSpeed) this.yawSpeed = -this.maxYawSpeed;
    }

    if (!this.yawLeft && !this.yawRight) {
      if (this.yawSpeed > this.minYawSpeed) {
        this.yawSpeed -= this.yawAccel * input.pressTime;
        if (this.yawSpeed < this.minYawSpeed) this.yawSpeed = this.minYawSpeed;
      } else if (this.yawSpeed < -this.minYawSpeed) {
        this.yawSpeed += this.yawAccel * input.pressTime;
        if (this.yawSpeed > -this.minYawSpeed) this.yawSpeed = -this.minYawSpeed;
      }
    }

    this.tmpQuaternion.set(
      this.rotationVector.x * this.pitchSpeed * input.pressTime,
      -this.yawSpeed * input.pressTime,
      -this.rollSpeed * input.pressTime,
      1
    ).normalize();
    this.mesh.quaternion.multiply(this.tmpQuaternion);
    this.mesh.rotation.setFromQuaternion(this.mesh.quaternion, this.mesh.rotation.order);
  }

  spawn() {
    this.mesh.position.x = Math.floor(Math.random() * 41) - 20;
    this.mesh.position.y = Math.floor(Math.random() * 41) - 20;
    this.mesh.position.z = Math.floor(Math.random() * 41) - 20;

    this.mesh.rotation.y = Math.random() * 361 * Math.PI / 180;
    this.mesh.rotation.y = Math.random() * 361 * Math.PI / 180;
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
  constructor(playerId, position, rotation, velocity) {
    super(new THREE.Vector3(0.2, 0.2, 0.2));
    this.playerId = playerId;

    this.speed = 120 + velocity;
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
    client.id = this.getAvailableId(this.clients);
    client.color = this.getRandomColor();
    this.clients[client.id] = client;

    let players = [];

    for (const key in this.clients) {
      const client = this.clients[key];

      if (!client.name) continue;

      const player = this.players[client.id];

      if (!player) continue;

      let playerPos = {x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z};
      let playerRot = {x: player.mesh.quaternion.x, y: player.mesh.quaternion.y, z: player.mesh.quaternion.z, w: player.mesh.quaternion.w};

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
      type: 'initWorld',
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
        client.send(JSON.stringify({type: 'initClient', id: client.id, color: client.color}));

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

      this.broadcast({type: 'removePlayer', id: client.id});

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
      keys: msg[3],
      pitch: msg[4]
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
          let bullet = new Bullet(player.id, player.mesh.position, player.mesh.rotation, player.speed);

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

      let playerPos = {x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z};
      let playerRot = {x: player.mesh.quaternion.x, y: player.mesh.quaternion.y, z: player.mesh.quaternion.z, w: player.mesh.quaternion.w};

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
        let playerRot = {x: player.mesh.quaternion.x, y: player.mesh.quaternion.y, z: player.mesh.quaternion.z, w: player.mesh.quaternion.w};

        this.clients[key].send(JSON.stringify({
          type: 'addPlayer',
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
    //return "#" + ("000000" + Math.floor(Math.random() * 16777216).toString(16)).substr(-6);
    let color = this.colors.shift();
    this.colors.push(color);
    return color;
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