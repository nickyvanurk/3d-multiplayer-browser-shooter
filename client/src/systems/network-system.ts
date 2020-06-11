import { System, Entity } from 'ecsy';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

import { PlayerInputState } from '../components/player-input-state';
import { Transform } from '../components/transform';
import { Physics } from '../components/physics';
import { Vector3 } from 'three';
import { Player } from '../components/player';
import { PlayerController } from '../components/player-controller';
import { CameraTarget } from '../components/camera-target';
import { SphereCollider } from '../components/sphere-collider';
import { Health } from '../components/health';
import { ParticleEffectOnDestroy } from '../components/particle-effect-on-destroy';
import { ParticleEffectType } from '../components/particle-effect';
import { Weapon, WeaponType } from '../components/weapon';
import { Weapons } from '../components/weapons';

export class NetworkSystem extends System {
  static queries: any = {
    playerInputState: {
      components: [PlayerInputState]
    }
  };

  private socket: WebSocket;
  private fixedUpdate: Function;
  private players: Map<string, PlayerType>;
  private mainPlayerId: string;

  init() {
    this.socket = new WebSocket(`ws://${process.env.SERVER_URL}`);

    this.socket.onopen = this.handleConnect.bind(this);
    this.socket.onclose = this.handleDisconnect.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);

    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));

    this.players = new Map<string, PlayerType>();
    this.mainPlayerId = null;
  }

  execute(delta: number) {
    this.fixedUpdate(delta);
  }

  handleFixedUpdate(delta: number) {
    let entity = this.queries.playerInputState.results[0];

    if (entity) {
      this.send(entity.getComponent(PlayerInputState).serialize());
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
  }
};

enum MessageType {
  Init,
  State
}
