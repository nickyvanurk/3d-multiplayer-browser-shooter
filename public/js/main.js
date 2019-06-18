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
    this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }
}

class Player {
  constructor(scene, id, position, rotation, health, color, name, mesh, isClient = false) {
    this.scene = scene;
    this.id = id;
    this.isClient = isClient;
    this.kills = 0;

    this.scale = 0.1;
    this.mesh = mesh;
    this.setOrientation(position, rotation);
    for (let i = 0, len = this.mesh.children.length; i < len; i++) {
      this.mesh.children[i].rotateX(-Math.PI / 2);
      this.mesh.children[i].rotateZ(-Math.PI / 2);
      this.mesh.children[i].scale.set(this.scale, this.scale, this.scale);
    }
    this.mesh.children[4].geometry.computeBoundingBox();
    this.boundingBox = this.mesh.children[4].geometry.boundingBox;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);

    this.speed = 8; // units/s
    this.rotationSpeed = 2;
    this.health = health;
    this.alive = health > 0;
    this.color = color;
    this.name = name;

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

    this.tmpQuaternion = new THREE.Quaternion();
    this.rotationVector = new THREE.Vector3();

    this.positionBuffer = [];

    this.healthBar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.1, 0.01),
      new THREE.MeshBasicMaterial({color: 0x00ff00})
    );
    this.healthBar.renderOrder = 999;
    this.healthBar.onBeforeRender = function (renderer) {renderer.clearDepth();};
    this.healthBar.geometry.translate(this.healthBar.geometry.parameters.width / 2, 0, 0 );
    this.healthBar.geometry.verticesNeedUpdate = true;
    this.healthBar.position.x -= this.healthBar.geometry.parameters.width / 2;
    this.healthBarPivot = new THREE.Object3D();
    this.healthBarPivot.add(this.healthBar);

    let height = (this.boundingBox.max.z - this.boundingBox.min.z) * this.scale;
    if (this.isClient) {
      this.healthBar.position.y = height;
      this.mesh.add(this.healthBarPivot);
    } else {
      this.healthBar.position.y = height * 2.5;
      this.scene.add(this.healthBarPivot);
    }

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
      this.nameTag .renderOrder = 999;
      this.nameTag .onBeforeRender = function( renderer ) {renderer.clearDepth();};

      var centerOffset = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
      this.nameTag.position.x = centerOffset;

      if (this.isClient) {
        this.nameTag.position.y = height + height / 6;
      } else {
        this.nameTag.position.y = height * 2.5 + height / 6;
      }

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

    if (!this.alive && this.positionBuffer.length) {
      this.positionBuffer = [];
    }

    if (this.health == 0 && this.alive) {
      this.alive = false;
    } else if (this.health > 0 && !this.alive) {
      this.alive = true;
    }

    if (!this.isClient){
      this.updateHealthBarOrientation(camera);
    }
  }

  setOrientation(position, rotation) {
    this.mesh.position.set(position.x, position.y, position.z);
    this.mesh.quaternion.copy(rotation);
  }

  setName(name) {
    this.nameTag.geometry.parameters.text = name;
  }

  setColor(color) {
    this.color = color;
    this.mesh.material.color = color;
  }

  updateHealthBarOrientation(camera) {
    this.healthBarPivot.lookAt(camera.getWorldPosition());
    this.healthBarPivot.position.copy(this.mesh.position);
  }

  setNameTagOrientation(camera) {
    this.healthBarPivot.rotation.set(camera.body.rotation.x, camera.body.rotation.y, camera.body.rotation.z);
  }

  applyInput(input) {
    this.forward = ((input.keys & 1) == 1);
    this.rollLeft = ((input.keys & 2) == 2);
    this.rollRight = ((input.keys & 4) == 4);
    this.yaw = input.yaw || 0;
    this.pitch = input.pitch || 0;

    this.mesh.translateZ(-this.speed);

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

    this.tmpQuaternion.set(
      -this.pitch * this.pitchSpeed,
      -this.yaw * this.yawSpeed,
      -this.rollSpeed,
      1
    ).normalize();
    this.mesh.quaternion.multiply(this.tmpQuaternion);
    this.mesh.rotation.setFromQuaternion(this.mesh.quaternion, this.mesh.rotation.order);
  }
}

class Bullet extends Entity {
  constructor(scene, playerId, position, rotation, color, velocity) {
    super(scene, new THREE.Vector3(0.2, 0.2, 0.2), position, rotation);
    this.scene = scene;
    this.playerId = playerId;

    this.speed = 120 + velocity;

    this.mesh.material.color = new THREE.Color(color);
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
    this.body = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1e7);
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
    let followSpeed = (this.target.speed / this.target.maxSpeed) > this.smoothSpeed ? 
                      (this.target.speed / this.target.maxSpeed) :
                      this.smoothSpeed;

    var relativeCameraOffset = new THREE.Vector3().copy(this.offset);
    let desiredPosition = relativeCameraOffset.applyMatrix4(this.target.mesh.matrixWorld);
    let smoothedPosition = new THREE.Vector3().lerpVectors(this.body.position, desiredPosition, followSpeed);
    this.body.position.copy(smoothedPosition);

    let desiredQuaternion = this.target.mesh.quaternion;
    this.body.quaternion.slerp(desiredQuaternion, followSpeed);
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
    this.serverUpdateRate = 40;

    this.id = null;
    this.color = null;
    this.name = null;

    this.players = {};
    this.bullets = {};

    this.keys = {forward: false, left: false, right: false, shoot: false};
    this.inputSequenceNumber = 0;
    this.pendingInputs = [];

    this.chatbox = document.getElementById('chatbox');
    this.chatInput = document.getElementById('chat-input');
    this.chatStatus = document.getElementById('chat-status');

    this.killbox = document.getElementById('killbox');

    this.setUpdateRate(60);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.getElementById('container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new Camera();

    let directionalLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    directionalLight.position.set(0, 0, 2);
    this.scene.add(directionalLight);
    this.scene.add(new THREE.HemisphereLight());

    this.createStarfield(6371);

    this.models = [
      {ds: 'models/fighter1.3ds', texture: 'models/kaoskiwi.jpg', mesh: null, color: '#ff0000'},
      {ds: 'models/fighter1.3ds', texture: 'models/idolknight.jpg', mesh: null, color: '#00ff00'},
      {ds: 'models/fighter1.3ds', texture: 'models/cinfa.jpg', mesh: null, color: '#d10042'},
      {ds: 'models/fighter1.3ds', texture: 'models/thor.jpg', mesh: null, color: '#c1acb3'},
      {ds: 'models/fighter1.3ds', texture: 'models/crono782.jpg', mesh: null, color: '#e0cb14'},
      {ds: 'models/fighter1.3ds', texture: 'models/jodomatis.jpg', mesh: null, color: '#ff443a'},
      {ds: 'models/fighter1.3ds', texture: 'models/freelancer.jpg', mesh: null, color: '#3c64c1'},
      {ds: 'models/fighter1.3ds', texture: 'models/robin.jpg', mesh: null, color: '#b83cc1'}
    ];

    const mtLoader = new THREE.MTLLoader();
    mtLoader.load('models/moon/moon.mtl', (materials) => {
      materials.preload();

      const objLoader = new THREE.OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.load('models/moon/moon.obj', (object) => {
        object.position.set(200, 100, -400);
        this.scene.add(object);
      });
    });

    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onLoad = function () {
      this.resourcesLoaded = true;
      this.ws = new WebSocket(location.origin.replace(/^http/, 'ws'));
      this.setEventHandlers();
    }.bind(this);

    //this.loadTextures(this.textures, this.loadingManager);
    this.loadModels(this.models, this.loadingManager);
  }

  setEventHandlers() {
    this.ws.onopen = this.onConnection.bind(this);
    this.ws.onmessage = this.processServerMessages.bind(this);

    document.body.onkeydown = this.processEvents.bind(this);
    document.body.onkeyup = this.processEvents.bind(this);
    document.body.onmousemove = this.processEvents.bind(this);
    window.addEventListener('resize', this.onResize.bind(this), false);
  }

  onResize() {
    this.camera.body.aspect = window.innerWidth / window.innerHeight;
    this.camera.body.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onConnection() {
    this.chatStatus.textContent = 'Choose name:';
    this.chatInput.removeAttribute('disabled');
    this.chatInput.focus();
  }

  processServerMessages(event) {
    let msg = JSON.parse(event.data);

    switch(msg.type) {
      case 'initClient': this.onInitClient(msg); break;
      case 'initWorld': this.onInitWorld(msg); break;
      case 'message': this.onMessage(msg); break;
      case 'addPlayer': this.onAddPlayer(msg); break;
      case 'removePlayer': this.onRemovePlayer(msg); break;
      case 'addBullet': this.onAddBullet(msg); break;
      case 'removeBullet': this.onRemoveBullet(msg); break;
      case 'worldState': this.onWorldState(msg); break;
    }
  }

  processEvents(event) {
    if (this.chatInput.disabled) {
      if (event.keyCode == 87 || event.keyCode == 38) this.keys.forward = event.type == 'keydown';
      if (event.keyCode == 65 || event.keyCode == 37) this.keys.left = event.type == 'keydown';
      if (event.keyCode == 68 || event.keyCode == 39) this.keys.right = event.type == 'keydown';
      if (event.keyCode == 32) this.keys.shoot = event.type == 'keydown';
    }

    if (event.keyCode == 13 && event.type == 'keydown') {
      if (this.chatInput.disabled) {
        this.chatInput.removeAttribute('disabled');
        this.chatInput.focus();
      } else {
        this.chatInput.setAttribute('disabled', 'disabled');
      }

      let msg = this.chatInput.value;

      if (!msg) {
        return;
      }

      if (this.name === null) {
        this.name = msg;
        this.ws.send(JSON.stringify({type: 'setName', name: msg}));
      } else {
        this.ws.send(JSON.stringify({type: 'msg', content: this.chatInput.value, time: +new Date()}));
      }

      this.chatInput.value = '';
    }

    if (event.type === 'mousemove') {
      const halfHeight = window.innerHeight / 2;
      const halfWidth = window.innerWidth / 2;

      this.keys.yaw = (event.pageX - halfWidth) / halfWidth;
      this.keys.pitch = (event.pageY - halfHeight) / halfHeight;
    }
  }

  update() {
    let dt = this.getDeltaTime();

    if (!this.resourcesLoaded) {
      return;
    }

    for (let key in this.players) {
      this.players[key].update(dt, this.camera.body);

      if (key != this.id) {
        if (this.players[this.id]) {
          this.players[key].setNameTagOrientation(this.camera);
        }
      }
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

  processInputs(dt) {    
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
    if (this.keys.yaw) input.yaw = this.keys.yaw;
    if (this.keys.pitch) input.pitch = this.keys.pitch;

    this.ws.send(JSON.stringify([
      input.id,
      input.pressTime,
      input.inputSequenceNumber,
      input.keys,
      input.yaw,
      input.pitch
    ]));

    // do client-side prediction
    if (this.players[this.id].alive) {
      this.players[this.id].applyInput(input);
    }

    // save this input for later reconciliation
    this.pendingInputs.push(input);
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


        r0 = new THREE.Quaternion().set(r0.x, r0.y, r0.z, r0.w);
        r1 = new THREE.Quaternion().set(r1.x, r1.y, r1.z, r1.w);
        player.mesh.quaternion.copy(r0.slerp(r1, (renderTimestamp - t0) / (t1 - t0)));
      }
    }
  }

  onInitClient(msg) {
    this.id = msg.id;
    this.color = msg.color;
    this.chatStatus.textContent = 'Connected';
  }

  onInitWorld(msg) {
    for (let i = 0; i < msg.players.length; i++) {
      let p = msg.players[i];
      let player = this.spawnPlayer(p.id, p.position, p.rotation, p.health, p.color, p.name, p.kills);
    }

    for (let i = 0; i < msg.bullets.length; i++) {
      let b = msg.bullets[i];
      let color = this.players[msg.bullets[i].playerId].color;
      this.spawnBullet(b.id, b.playerId, b.position, b.rotation, color, this.players[b.playerId].speed);
    }
  }

  onMessage(msg) {
    this.addMessage(msg.author, msg.content, msg.color, new Date(msg.time));
  }

  onAddPlayer(msg) {
    if (!this.players[msg.id]) {
      let player = this.spawnPlayer(
        msg.id,
        msg.position,
        msg.rotation,
        msg.health,
        msg.color,
        msg.name,
        msg.kills
      );

      if (msg.id == this.id) {
        this.camera.setTarget(player);
        this.players[this.id] = player;
      } else {
        this.players[msg.id] = player;
      }

      this.updateKillbox();
    }
  }

  updateKillbox() {
    this.killbox.innerHTML = "";
    let players = this.sortPlayersOnKills();
    players.length = 10;
    for (let key in players) {
      this.addPlayerToKillbox(players[key]);
    }
  }

  onRemovePlayer(msg) {
    if (this.players[msg.id]) {
      this.destroyPlayer(msg.id);
    }

    this.updateKillbox();
  }

  onAddBullet(msg) {
    let color = this.players[msg.playerId].color;
    this.spawnBullet(msg.id, msg.playerId, msg.position, msg.rotation, color, this.players[msg.playerId].speed);
  }

  onRemoveBullet(msg) {
    this.destroyBullet(msg.id);
  }

  onWorldState(msg) {
    for (let i = 0; i < msg.states.length; i++) {
      let state = {
        id: msg.states[i][0],
        position: msg.states[i][1],
        rotation: msg.states[i][2],
        lastProcessedInput: msg.states[i][3],
        health: msg.states[i][4],
        speed: msg.states[i][5],
        rollSpeed: msg.states[i][6],
        yaw: msg.states[i][7],
        pitch: msg.states[i][8],
        kills: msg.states[i][9]
      };

      if (!this.players[state.id]) continue;

      let player = this.players[state.id];

      player.health = state.health;

      if (player.kills != state.kills) {
        player.kills = state.kills;
        this.updateKillbox();
      }

      if (state.id == this.id) {
        // received the authoritative positon of this client's player
        player.speed = state.speed;
        player.rollSpeed = state.rollSpeed;
        player.yaw = state.yaw;
        player.pitch = state.pitch;
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
  }

  spawnPlayer(id, position, rotation, health, color, name, kills) {
    let model = null;
    for (let key in this.models) {
      model = this.models[key];
      if (model.color == color) {
        break;
      }
    }

    this.players[id] = new Player(this.scene, id, position, rotation, health, color, name,
      model.mesh.clone(), this.id == id);
    this.players[id].kills = kills;
    return this.players[id];
  }

  addPlayerToKillbox(player) {
    let name = player.name;
    if (name.length > 15) {
      name = name.substring(0, 15);
      name += '...';
    }

    let p = document.createElement('p');
    p.className = 'player';
    p.innerHTML = '<span style="color:' + player.color + '">' + name + '</span>' + player.kills;
    this.killbox.appendChild(p);
  }

  sortPlayersOnKills() {
    let sortedPlayersOnKills = [];
    for (let key in this.players) {
      let player = this.players[key];
      sortedPlayersOnKills.push({name: player.name, kills: player.kills, color: player.color});
    }
    sortedPlayersOnKills.sort(function (a, b) {
      return b.kills - a.kills;
    });
    return sortedPlayersOnKills;
  }

  destroyPlayer(id) {
    this.players[id].destroy();
    delete this.players[id];
  }

  spawnBullet(id, playerId, position, rotation, color, velocity) {
    this.bullets[id] = new Bullet(this.scene, playerId, position, rotation, color, velocity);
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

  createStarfield(radius) {
    let starsGeometry = [new THREE.Geometry(), new THREE.Geometry()];

    for (let i = 0; i < 250; i++) {
      let vertex = new THREE.Vector3();
      vertex.x = Math.random() * 2 - 1;
      vertex.y = Math.random() * 2 - 1;
      vertex.z = Math.random() * 2 - 1;
      vertex.multiplyScalar(radius);
      starsGeometry[0].vertices.push(vertex);
    }

    for (let i = 0; i < 1500; i++) {
      let vertex = new THREE.Vector3();
      vertex.x = Math.random() * 2 - 1;
      vertex.y = Math.random() * 2 - 1;
      vertex.z = Math.random() * 2 - 1;
      vertex.multiplyScalar(radius);
      starsGeometry[1].vertices.push(vertex);
    }

    let stars;
    const starsMaterials = [
      new THREE.PointsMaterial( { color: 0x555555, size: 2, sizeAttenuation: false } ),
      new THREE.PointsMaterial( { color: 0x555555, size: 1, sizeAttenuation: false } ),
      new THREE.PointsMaterial( { color: 0x333333, size: 2, sizeAttenuation: false } ),
      new THREE.PointsMaterial( { color: 0x3a3a3a, size: 1, sizeAttenuation: false } ),
      new THREE.PointsMaterial( { color: 0x1a1a1a, size: 2, sizeAttenuation: false } ),
      new THREE.PointsMaterial( { color: 0x1a1a1a, size: 1, sizeAttenuation: false } )
    ];

    for (let i = 10; i < 30; i++) {
      stars = new THREE.Points(starsGeometry[i % 2], starsMaterials[i % 6]);
      stars.rotation.x = Math.random() * 6;
      stars.rotation.y = Math.random() * 6;
      stars.rotation.z = Math.random() * 6;
      stars.scale.setScalar( i * 10 );
      stars.matrixAutoUpdate = false;
      stars.updateMatrix();
      this.scene.add(stars);
    }
  }

  loadModels(models, loadingManager) {
    for (var _key in models) {
      (function (key) {
        var loader = new THREE.TDSLoader(loadingManager);
        for (let p in models) {
          let model = models[p];
          loader.load(model.ds, function (mesh) {
            mesh.traverse(function (node) {
              if (node instanceof THREE.Mesh) {
                if (node.name === "ship") {
                  // TODO: fix, no longer works after three.js upgrade
                  node.material.map.image = new Image();
                  const imageSrc = node.material.map.image.baseURI + model.texture;
                  node.material.map.image.src = imageSrc;
                }

                console.log(node);

                node.castShadow = 'castShadow' in model ? model.castShadow : true;
                node.castShadow = 'receiveShadow' in model ? model.receiveShadow : true;
              }
            });
            model.mesh = mesh;
          });
        }
      })(_key);
    }
  }

  loadTextures(textures, loadingManager) {
    var loader = new THREE.TextureLoader(loadingManager);
    for (let i = 0; i < textures.length; i++) {
      loader.load(textures[i]);
    }
  }
}

const client = new Client();
