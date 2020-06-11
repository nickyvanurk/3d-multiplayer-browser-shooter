import { System, Entity } from 'ecsy';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

import { PlayerInputState } from '../components/player-input-state';
import { Transform } from '../components/transform';
import { Physics } from '../components/physics';
import { Vector3, Quaternion } from 'three';
import { Player } from '../components/player';

export class NetworkSystem extends System {
  static queries: any = {
    playerInputState: {
      components: [PlayerInputState]
    }
  };

  private socket: WebSocket;
  private fixedUpdate: Function;
  private players: Map<string, PlayerType>;

  init() {
    this.socket = new WebSocket(`ws://${process.env.SERVER_URL}`);

    this.socket.onopen = this.handleConnect.bind(this);
    this.socket.onclose = this.handleDisconnect.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);

    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));

    this.players = new Map<string, PlayerType>();
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
    const message: PlayerTransformMessage = JSON.parse(event.data);

    const p = message.position;
    const r = message.rotation;

    const player = this.players.get(message.id);

    if (!player) {
      const player = this.world.createEntity()
        .addComponent(Player)
        .addComponent(Transform, {
          position: new Vector3(p.x, p.y, p.z),
          rotation: new Quaternion(r.x, r.y, r.z, r.w)
        });

      this.players.set(message.id, { entity: player });

      return;
    }

    const transform = player.entity.getMutableComponent(Transform);
    transform.position.set(p.x, p.y, p.z);
    transform.rotation.set(r.x, r.y, r.z, r.w);
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
}

type PlayerType = {
  entity: Entity
};

type PlayerTransformMessage = {
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
