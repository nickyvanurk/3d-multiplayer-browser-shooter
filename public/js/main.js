class Entity {
  constructor(scene, size, position, rotation) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshPhongMaterial({color: 0xff0000})
    );
    this.setOrientation(position, rotation);
    scene.add(this.mesh);
  }

  setOrientation(position, rotation) {
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.rotation.set(rotation.x, rotation.y, rotation.z);    
  }
}

class Player extends Entity {
  constructor(scene, id, position, rotation, health, color, name) {
    super(scene, new THREE.Vector3(1, 1, 1), position, rotation);
    this.scene = scene;
    this.id = id;

    this.speed = 8; // units/s
    this.rotationSpeed = 2;
    this.health = health;
    this.alive = health > 0;
    this.color = color;
    this.name = name;

    this.positionBuffer = [];

    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;

    this.healthBar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0),
      new THREE.MeshBasicMaterial({color: 0x00ff00})
    );
    this.healthBar.geometry.translate(this.healthBar.geometry.parameters.width / 2, 0, 0 );
    this.healthBar.geometry.verticesNeedUpdate = true;
    this.healthBar.position.x -= this.healthBar.geometry.parameters.width / 2;
    this.healthBarPivot = new THREE.Object3D();
    this.healthBarPivot.add(this.healthBar);
    this.scene.add(this.healthBarPivot);

    let loader = new THREE.FontLoader();

    loader.load('../fonts/helvetiker_regular.typeface.json', function (font) {
      let geometry = new THREE.TextGeometry(this.name, {
        font: font,
        size: 0.3,
        height: 0,
        curveSegments: 12,
      });

      geometry.computeBoundingBox();

      this.nameTag = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({color: 0xffff00, flatShading: true})
      );

      var centerOffset = -0.5 * (this.nameTag.geometry.boundingBox.max.x -
        this.nameTag.geometry.boundingBox.min.x);
      this.nameTag.position.x = centerOffset;
      this.nameTag.position.y = this.mesh.geometry.parameters.height / 4;

      this.healthBarPivot.add(this.nameTag);
    }.bind(this));
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.healthBarPivot);
  }

  update(dt, camera) {
    this.healthBar.scale.x = this.health / 100;

    if (this.healthBar.scale.x == 0) {
      this.healthBar.scale.x = 0.00001;
    }

    if (this.mesh.material.color.b != 1 && !this.alive) {
      this.mesh.material.color.setHex(0x0000ff);
    } else if (this.mesh.material.color != this.color && this.alive) {
      this.mesh.material.color.setHex(0xff0000);
    }

    if (!this.alive && this.positionBuffer.length) {
      this.positionBuffer = [];
    }

    if (this.health == 0 && this.alive) {
      this.alive = false;
    } else if (this.health > 0 && !this.alive) {
      this.alive = true;
    }

    this.updateHealthBarOrientation(camera);
  }

  setName(name) {
    this.nameTag.geometry.parameters.text = name;
  }

  setColor(color) {
    this.color = color;
    this.mesh.material.color = color;
  }

  updateHealthBarOrientation(camera) {
    this.healthBarPivot.position.copy(this.mesh.position);
    let height = this.mesh.geometry.parameters.height;
    this.healthBarPivot.position.y = height + height / 4;
    this.healthBarPivot.lookAt(camera.getWorldPosition());
  }

  applyInput(input) {
    if ((input.keys & 1) == 1) this.mesh.translateZ(-this.speed * input.pressTime);
    if ((input.keys & 2) == 2) this.mesh.rotation.y += this.rotationSpeed * input.pressTime;
    if ((input.keys & 4) == 4) this.mesh.rotation.y -= this.rotationSpeed * input.pressTime;
  }
}

class Bullet extends Entity {
  constructor(scene, playerId, position, rotation) {
    super(scene, new THREE.Vector3(0.2, 0.2, 0.2), position, rotation);
    this.scene = scene;
    this.playerId = playerId;

    this.speed = 20;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }

  update(dt) {
    this.mesh.translateZ(-this.speed * dt);
  }
}

class Camera {
  constructor() {
    this.body = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.body.position.y = 2;
    this.offset = new THREE.Vector3(0, 3, 15);
    this.smoothSpeed = 0.125;
    this.target =  null;
  }

  update() {
    if (!this.target) {
      return;
    }

    this.followTarget();
  }

  followTarget() {
    var relativeCameraOffset = new THREE.Vector3().copy(this.offset);
    let desiredPosition = relativeCameraOffset.applyMatrix4(this.target.mesh.matrixWorld);
    let smoothedPosition = new THREE.Vector3().lerpVectors(this.body.position, desiredPosition, this.smoothSpeed);
    this.body.position.copy(smoothedPosition);
    this.body.lookAt(this.target.mesh.position);
  }

  setTarget(entity) {
    this.target = entity;
    this.body.position.copy(entity.mesh.position);
    this.body.rotation.set(entity.mesh.rotation.x, entity.mesh.rotation.y, entity.mesh.rotation.z);
    this.body.translateX(this.offset.x)
    this.body.translateY(this.offset.y);
    this.body.translateZ(this.offset.z);
  }
}

class Client {
  constructor() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = this.onConnection.bind(this);
    this.ws.onmessage = this.processServerMessages.bind(this);

    this.serverUpdateRate = 20;

    this.id = null;
    this.color = null;
    this.name = null;

    this.players = {};
    this.bullets = {};

    this.keys = {
      forward: false,
      left: false,
      right: false,
      shoot: false
    };

    document.body.onkeydown = this.processEvents.bind(this);
    document.body.onkeyup = this.processEvents.bind(this);

    this.inputSequenceNumber = 0;
    this.pendingInputs = [];

    this.setUpdateRate(60);

    this.chatbox = document.getElementById('chatbox');
    this.chatInput = document.getElementById('chat-input');
    this.chatStatus = document.getElementById('chat-status');
  }

  onConnection() {
    this.chatStatus.textContent = 'Choose name:';
    this.chatInput.removeAttribute('disabled');
    this.chatInput.focus();
    this.init();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.getElementById('container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new Camera();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    let light = new THREE.PointLight(0xffffff, 0.8, 18);
    light.position.set(3, 12, 3);
    light.castShadow = true;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 25;
    this.scene.add(light);

    let plane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshPhongMaterial({color:0xffffff})
    );
    plane.rotation.x -= Math.PI / 2;
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  processEvents(event) {
    if (event.keyCode == 87 || event.keyCode == 38) this.keys.forward = event.type == 'keydown';
    if (event.keyCode == 65 || event.keyCode == 37) this.keys.left = event.type == 'keydown';
    if (event.keyCode == 68 || event.keyCode == 39) this.keys.right = event.type == 'keydown';
    if (event.keyCode == 32) this.keys.shoot = event.type == 'keydown';

    if (event.keyCode == 13) {
      let msg = this.chatInput.value;

      if (!msg) {
        return;
      }

      this.chatInput.value = '';
      this.chatInput.setAttribute('disabled', 'disabled');

      if (this.name === null) {
        this.name = msg;
        this.ws.send(JSON.stringify({
          type: 'setName',
          name: msg
        }));
      }
    }
  }

  processInputs(dt) {
    if ((!this.keys.left && !this.keys.right && !this.keys.forward && !this.keys.shoot) ||
         (this.keys.left && this.keys.right && !this.keys.forward)) {
      return;
    }

    let input = {
      id: this.id,
      pressTime: dt,
      inputSequenceNumber: this.inputSequenceNumber++,
      keys: 0
    };

    if (this.keys.forward) input.keys += 1;
    if (this.keys.left) input.keys += 2;
    if (this.keys.right) input.keys += 4;
    if (this.keys.shoot) input.keys += 8;

    this.ws.send(JSON.stringify([
      input.id,
      input.pressTime,
      input.inputSequenceNumber,
      input.keys
    ]));

    // do client-side prediction
    if (this.players[this.id].alive) {
      this.players[this.id].applyInput(input);
    }

    // save this input for later reconciliation
    this.pendingInputs.push(input);
  }

  update() {
    if (this.id == null) return;

    let dt = this.getDeltaTime();

    for (let key in this.players) {
      this.players[key].update(dt, this.camera.body);
    }

    for (let key in this.bullets) {
      this.bullets[key].update(dt);
    }

    this.camera.update();

    if (this.players[this.id]) {
      this.processInputs(dt);
    }

    this.interpolatePlayers(dt);
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera.body);
  }

  processServerMessages(event) {
    let msg = JSON.parse(event.data);

    switch(msg.type) {
      case 'init':
        this.id = msg.id;
        this.color = msg.color;
        for (let i = 0; i < msg.players.length; i++) {
          this.spawnPlayer(
            msg.players[i].id,
            msg.players[i].position,
            msg.players[i].rotation,
            msg.players[i].health,
            msg.players[i].color,
            msg.players[i].name
          );
        }
        break;
      case 'color':
        this.color = msg.color;
        break;
      case 'message':
        this.addMessage(msg.author, msg.content, msg.color, new Date(msg.time));
        break;
      case 'id':
        this.id = msg.id;
        break;
      case 'spawnPlayer':
        if (!this.players[msg.id]) {
          let player = this.spawnPlayer(
            msg.id,
            msg.position,
            msg.rotation,
            msg.health,
            msg.color,
            msg.name
          );

          if (msg.id == this.id) {
            this.camera.setTarget(player);
            this.players[this.id] = player;
          } else {
            this.players[msg.id] = player;
          }
        }
        break;
      case 'bulletSpawn':
        this.spawnBullet(msg.id, msg.playerId, msg.position, msg.rotation);
        break;
      case 'bulletDestroy':
        this.destroyBullet(msg.id);
        break;
      case 'worldState':
        for (let i = 0; i < msg.states.length; i++) {
          let state = msg.states[i];

          let player = this.players[state.id];

          player.health = state.health;

          if (state.id == this.id) {
            // received the authoritative positon of this client's player
            player.setOrientation(state.position, state.rotation);

            for (let j = 0; j < this.pendingInputs.length;) {
              let input = this.pendingInputs[j];

              if (input.inputSequenceNumber <= state.lastProcessedInput) {
                // Already processed; its effect is already taken into
                // account into the world update.
                this.pendingInputs.splice(j, 1);
              } else {
                if (player.alive) {
                  player.applyInput(input);
                }

                j++;
              }
            }
          } else {
            // received the position of an player other than this client
            if (player.alive) {
              player.positionBuffer.push([+new Date(), state.position, state.rotation]);
            } else {
              player.setOrientation(state.position, state.rotation);
            }
          }
        }
        break;
      case 'disconnect':
        if (this.players[msg.id]) {
          this.destroyPlayer(msg.id);
        }
        break;
    }
  }

  interpolatePlayers(dt) {
    let now = +new Date();
    let renderTimestamp = now - (1000.0 / this.serverUpdateRate);

    for (let i in this.players) {
      let player = this.players[i];

      if (player.id == this.id) continue;

      let buffer = player.positionBuffer;

      while (buffer.length >= 2 && buffer[1][0] <= renderTimestamp) {
        buffer.shift();
      }

      if (buffer.length >= 2 && buffer[0][0] <= renderTimestamp && renderTimestamp <= buffer[1][0]) {
        let p0 = buffer[0][1];
        let p1 = buffer[1][1];
        let r0 = buffer[0][2];
        let r1 = buffer[1][2];
        let t0 = buffer[0][0];
        let t1 = buffer[1][0];

        player.mesh.position.x = p0.x + (p1.x - p0.x) * (renderTimestamp - t0) / (t1 - t0);
        player.mesh.position.y = p0.y + (p1.y - p0.y) * (renderTimestamp - t0) / (t1 - t0);
        player.mesh.position.z = p0.z + (p1.z - p0.z) * (renderTimestamp - t0) / (t1 - t0);

        player.mesh.rotation.x = r0.x + (r1.x - r0.x) * (renderTimestamp - t0) / (t1 - t0);
        player.mesh.rotation.y = r0.y + (r1.y - r0.y) * (renderTimestamp - t0) / (t1 - t0);
        player.mesh.rotation.z = r0.z + (r1.z - r0.z) * (renderTimestamp - t0) / (t1 - t0);
      }
    }
  }

  spawnPlayer(id, position, rotation, health, color, name) {
    this.players[id] = new Player(this.scene, id, position, rotation, health, color, name);
    return this.players[id];
  }

  destroyPlayer(id) {
    this.players[id].destroy();
    delete this.players[id];
  }

  spawnBullet(id, playerId, position, rotation) {
    this.bullets[id] = new Bullet(this.scene, playerId, position, rotation);
    return this.bullets[id];
  }

  destroyBullet(id) {
    this.bullets[id].destroy();
    delete this.bullets[id];
  }

  getDeltaTime() {
    let now = +new Date();
    let dt =  (now - (this.last || now)) / 1000.0;
    this.last = now;
    return dt;
  }

  setUpdateRate(hz) {
    this.updateRate = hz;

    clearInterval(this.updateInterval);
    this.updateInterval = setInterval(this.update.bind(this), 1000 / this.updateRate);
  }

  addMessage(author, message, color, dt) {
    let p = document.createElement('p');
    p.className = 'chat-message';
    p.innerHTML = '[' + (dt.getHours() < 10 ? '0'
      + dt.getHours() : dt.getHours()) + ':'
      + (dt.getMinutes() < 10
        ? '0' + dt.getMinutes() : dt.getMinutes())
      + '] <span style="color:' + color + '">'
      + author + '</span> : ' + message;

    this.chatbox.appendChild(p);
    this.chatbox.scrollTop = this.chatbox.scrollHeight;
  }
}

const client = new Client();

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