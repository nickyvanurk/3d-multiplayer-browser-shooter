import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import Player from './player.js';
import Bullet from './bullet.js';
import Camera from './camera.js';
import NetworkManager from './network-manager.js';

class Client {
    constructor() {
        this.networkManager = new NetworkManager(this);

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
        this.createSkybox(this.scene);

        this.models = [
            {gltf: 'models/spaceships/2.gltf', mesh: null, color: '#ff0000'},
        ];

        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onLoad = function () {
            this.resourcesLoaded = true;
            this.networkManager.init(location.origin.replace(/^http/, 'ws'));
            this.setEventHandlers();
        }.bind(this);

        this.loadModels(this.models, this.loadingManager);
    }

    setEventHandlers() {
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

                this.networkManager.sendName(this.name);
            } else {
                this.networkManager.sendChatMessage(this.chatInput.value);
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

        this.networkManager.sendInputState([
            input.id,
            input.pressTime,
            input.inputSequenceNumber,
            input.keys,
            input.yaw,
            input.pitch
        ]);

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

    onWorldState(message) {
        var array = new Float32Array(message);

        const worldStateFields = 15;

        for (let i = 0; i < (array.length-1)/worldStateFields; i++) {
            let state = {
                id: array[1+i*worldStateFields],
                position: {
                    x: array[1+i*worldStateFields + 1],
                    y: array[1+i*worldStateFields + 2],
                    z: array[1+i*worldStateFields + 3]
                },
                rotation: {
                    x: array[1+i*worldStateFields + 4],
                    y: array[1+i*worldStateFields + 5],
                    z: array[1+i*worldStateFields + 6],
                    w: array[1+i*worldStateFields + 7],
                },
                lastProcessedInput: array[1+i*worldStateFields + 8],
                health: array[1+i*worldStateFields + 9],
                speed: array[1+i*worldStateFields + 10],
                rollSpeed: array[1+i*worldStateFields + 11],
                yaw: array[1+i*worldStateFields + 12],
                pitch: array[1+i*worldStateFields + 13],
                kills: array[1+i*worldStateFields + 14]
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
                var loader = new GLTFLoader(loadingManager);
                for (let p in models) {
                    let model = models[p];
                    loader.load(model.gltf, function (gltf) {
                        model.mesh = gltf.scene;
                    });
                }
            })(_key);
        }
    }

    createSkybox(scene) {
        const cubeMaterials = [
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/right.png'), side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/left.png'), side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/top.png'), side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/bottom.png'), side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/front.png'), side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load('../images/skybox/back.png'), side: THREE.BackSide }),
        ];
        const geometry = new THREE.BoxGeometry(100000, 100000, 100000);
        const cube = new THREE.Mesh(geometry, cubeMaterials);

        scene.add(cube);
    }
}

export default Client;
