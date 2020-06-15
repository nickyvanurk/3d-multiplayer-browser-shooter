import { System, Entity } from 'ecsy';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

import { PlayerInputState } from '../components/player-input-state';
import { Transform } from '../components/transform';
import { Physics } from '../components/physics';
import { Vector3, Object3D, Quaternion, Euler } from 'three';
import { Player } from '../components/player';
import { PlayerController } from '../components/player-controller';
import { CameraTarget } from '../components/camera-target';
import { Camera } from '../components/camera';
import { SphereCollider } from '../components/sphere-collider';
import { Health } from '../components/health';
import { ParticleEffectOnDestroy } from '../components/particle-effect-on-destroy';
import { ParticleEffectType } from '../components/particle-effect';
import { Weapon, WeaponType } from '../components/weapon';
import { Weapons } from '../components/weapons';
import { Object3d } from '../components/object3d';
import { PhysicsSystem } from './physics-system';

export class NetworkSystem extends System {
  static queries: any = {
    playerInputState: {
      components: [PlayerInputState]
    },
    camera: {
      components: [Object3d, Camera]
    },
    cameraTarget: {
      components: [CameraTarget]
    }
  };

  private socket: WebSocket;
  private fixedUpdate: Function;
  private players: Map<string, PlayerType>;
  private mainPlayerId: string;
  private lastPacketTime: number;
  private pendingInputs: Array<PlayerInputState>;
  private inputSequenceNumber: number;

  init() {
    this.socket = new WebSocket(`ws://${process.env.SERVER_URL}`);

    this.socket.onopen = this.handleConnect.bind(this);
    this.socket.onclose = this.handleDisconnect.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);

    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));

    this.players = new Map<string, PlayerType>();
    this.mainPlayerId = null;
    this.lastPacketTime = Date.now();
    this.pendingInputs = [];
    this.inputSequenceNumber = 0;
  }

  execute(delta: number) {
    this.fixedUpdate(delta);
  }

  handleFixedUpdate(delta: number) {
    let entity = this.queries.playerInputState.results[0];

    if (entity) {
      const input = entity.getComponent(PlayerInputState);

      // send input to server
      this.inputSequenceNumber++;
      this.send(input.serialize());

      // do player physics with inputstate, same as server.
      this.world.getSystem(PhysicsSystem).play();

      // save input for reconciliation
      this.pendingInputs.push(input);
    }
  }

  handleConnect(event: Event) {
    console.log(`Connected to server ${process.env.SERVER_URL}`);
  }

  handleDisconnect(event: Event) {
    console.log(`Disconnect from server ${process.env.SERVER_URL}`);
  }

  handleMessage(event: MessageEvent) {
    const message: Message = JSON.parse(event.data);

    switch (message.type) {
      case MessageType.Init:
        this.handleInit(message.payload);
        break;
      case MessageType.State:
        this.handleState(message.payload);
        break;
    }

    this.lastPacketTime = Date.now();
  }

  send(payload: object | string) {
    try {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(payload));
      }
    } catch (error) {
      console.error(`Error sending to player`);
    }
  }

  handleInit(payload: MessageInit) {
    this.mainPlayerId = payload.id;
  }

  handleState(payload: MessagePlayerState) {
    const player = this.players.get(payload.id);

    if (!player) {
      const player = this.isMainPlayer(payload.id) ? this.createMainPlayer()
                                                   : this.createPlayer();
      this.players.set(payload.id, { entity: player });
      return;
    }

    const p = payload.position;
    const r = payload.rotation;

    const transform = player.entity.getMutableComponent(Transform);
    transform.position.set(p.x, p.y, p.z);
    transform.rotation.set(r.x, r.y, r.z, r.w);

    // const delta = Date.now() - this.lastPacketTime;

    if (this.mainPlayerId === payload.id) {
      // console.log(this.inputSequenceNumber - payload.lastProcessedInput);

      const playerInputState = player.entity.getMutableComponent(PlayerInputState);

      if (playerInputState) {

        // playerInputState.movementX = payload.state.movement.x;
        // playerInputState.movementY = payload.state.movement.y;
        // playerInputState.movementZ = payload.state.movement.z;
        // playerInputState.roll = payload.state.roll;
        // playerInputState.yaw = payload.state.yaw;
        // playerInputState.pitch = payload.state.pitch;

        // for (let i = 0, l = this.pendingInputs.length; i < l; ++i) {
        //   if (this.inputSequenceNumber <= payload.lastProcessedInput) {
        //     this.pendingInputs.splice(i, 1);
        //   } else {
        //     this.world.getSystem(PhysicsSystem).execute(1000/60, Date.now())
        //   }

        //   i++;
        // }

        // console.log(payload.state.movement.x);

      }


      const camera = this.queries.camera.results[0];
      const cameraTarget = this.queries.cameraTarget.results[0];

      if (camera && cameraTarget) {
        const transform = cameraTarget.getComponent(Transform);

        const obj = new Object3D();
        obj.position.copy(transform.position);
        obj.quaternion.copy(transform.rotation);
        obj.translateY(1);
        obj.translateZ(-4);
        obj.quaternion.multiply(new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'XYZ')).normalize());

        const cameraTransform = camera.getMutableComponent(Transform);
        // cameraTransform.position.lerp(obj.position, 1 - Math.exp(-10 * (delta/1000)));
        // cameraTransform.rotation.slerp(obj.quaternion,  1 - Math.exp(-10 * (delta/1000)));
        cameraTransform.position.copy(obj.position);
        cameraTransform.rotation.copy(obj.quaternion);
      }
    }
  }

  createMainPlayer() : Entity {
    const player = this.world.createEntity()
      .addComponent(Player)
      .addComponent(Transform)
      .addComponent(PlayerController, {
        rollLeft: 'KeyQ',
        rollRight: 'KeyE',
        forward: 'KeyW',
        backward: 'KeyS',
        strafeLeft: 'KeyA',
        strafeRight: 'KeyD',
        strafeUp: 'Space',
        strafeDown: 'KeyC',
        boost: 'ShiftLeft',
        weaponPrimary: 0
      })
      .addComponent(CameraTarget)
      .addComponent(Physics)
      // .addComponent(SphereCollider, {radius: 1.25})
      .addComponent(Health, {value: 100})
      .addComponent(ParticleEffectOnDestroy, {type: ParticleEffectType.Explosion});

    const weapon1 = this.world.createEntity()
      .addComponent(Transform)
      .addComponent(Weapon, {
        type: WeaponType.Gun,
        offset: new Vector3(0.5, 0, 0.5),
        fireInterval: 100,
        parent: player
      });

    const weapon2 = this.world.createEntity()
      .addComponent(Transform)
      .addComponent(Weapon, {
        type: WeaponType.Gun,
        offset: new Vector3(-0.5, 0, 0.5),
        fireInterval: 100,
        parent: player
      });

    player.addComponent(Weapons, {
      primary: [weapon1, weapon2]
    });

    return player;
  }

  createPlayer() : Entity {
    return this.world.createEntity()
      .addComponent(Player)
      .addComponent(Transform)
      .addComponent(Physics)
      // .addComponent(SphereCollider, {radius: 1.25})
      .addComponent(Health, {value: 100})
      .addComponent(ParticleEffectOnDestroy, {type: ParticleEffectType.Explosion});
  }

  isMainPlayer(id: string) {
    return id === this.mainPlayerId;
  }
}

type PlayerType = {
  entity: Entity
};

type Message = {
  type: number,
  payload: any
};

type MessageInit = {
  id: string
};

type MessagePlayerState = {
  id: string,
  position: {
    x: number,
    y: number,
    z: number
  },
  rotation: {
    x: number,
    y: number,
    z: number,
    w: number
  },
  state: {
    movement: any,
    roll: number,
    yaw: number,
    pitch: number
  },
  lastProcessedInput: number
};

enum MessageType {
  Init,
  State
}
