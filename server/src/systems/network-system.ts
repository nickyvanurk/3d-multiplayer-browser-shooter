import logger from '../utils/logger';
import { System, Entity } from 'ecsy';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

import { PlayerInputState } from 'shared/src/components/player-input-state';
import { Transform } from 'shared/src/components/transform';
import { Physics  } from 'shared/src/components/physics';

export class NetworkSystem extends System {
  static queries: any = {
    playerInputStates: {
      components: [PlayerInputState],
      listen: {
        added: true,
        removed: true
      }
    }
  };

  private players: Map<string, Player>;
  private fixedUpdate: Function;
  private playerInputStates: Entity[];

  init() {
    this.players = new Map();
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
    this.playerInputStates = [];

    const wss = new WebSocket.Server({ port: +process.env.PORT! || 1337 });
    logger.info(`Listening on port ${+process.env.PORT! || 1337}`);

    wss.on('connection', this.handleConnect.bind(this));
  }

  execute(delta: number) {
    this.queries.playerInputStates.added.forEach((entity: Entity) => {
      this.playerInputStates.push(entity);
    });

    this.queries.playerInputStates.removed.forEach((entity: Entity) => {
      this.playerInputStates = this.playerInputStates.filter(e => e !== entity);
    });

    this.fixedUpdate(delta);
  }

  handleFixedUpdate(delta: number) {
    const transforms = [];

    this.players.forEach((player: Player, id: string) => {
      const transform = player.entity.getComponent(Transform);
      const playerInputState = player.entity.getMutableComponent(PlayerInputState);

      const p = transform.position;
      const r = transform.rotation;

      transforms.push({
        id,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
        state: playerInputState.serialize()
      });
    });

    this.players.forEach((player: Player, id: string) => {
      const lastProcessedInput = player.lastProcessedInput;

      transforms.forEach((transform: any) => {
        this.send(id, {
          type: MessageType.State,
          payload: { id, ...transform, lastProcessedInput }
        });
      })
    });
  }

  handleConnect(ws: WebSocket) {
    const id = uuidv4();
    const player = this.world.createEntity()
      .addComponent(PlayerInputState)
      .addComponent(Transform)
      .addComponent(Physics);

    this.players.set(id, { ws, entity: player, lastProcessedInput: 0 });

    ws.on('close', () => this.handleDisconnect(id));
    ws.on('error', () => this.handleDisconnect(id));
    ws.on('message', (data) => this.handleMessage(id, data));

    this.send(id, {
      type: MessageType.Init,
      payload: { id }
    });

    logger.info(`${id}: connected`);
  }

  handleDisconnect(id: string) {
    this.players.get(id).entity.remove();
    this.players.delete(id);
    logger.info(`${id}: connection closed`);
  }

  handleMessage(id: string, data: WebSocket.Data) {
    const player = this.players.get(id);

    if (!player.entity.hasComponent(PlayerInputState)) {
      logger.error(`Player ${id} should have PlayerInputState`);
      return;
    }

    const received: MessagePlayerState = JSON.parse(<string> data);
    const playerInputState = player.entity.getMutableComponent(PlayerInputState);

    playerInputState.movementX = received.movement.x;
    playerInputState.movementY = received.movement.y;
    playerInputState.movementZ = received.movement.z;
    playerInputState.roll = received.roll;
    playerInputState.yaw = received.yaw;
    playerInputState.pitch = received.pitch;

    player.lastProcessedInput++;
  }

  send(id: string, payload: object | string) {
    const ws = this.players.get(id).ws;

    if (!ws) return;

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    } catch (error) {
      console.error(`Error sending to player`);
    }
  }
}

type Player = {
  ws: WebSocket,
  entity: Entity,
  lastProcessedInput: number
};

type MessagePlayerState = {
  movement: {
    x: number,
    y: number,
    z: number
  }
  roll: number,
  yaw: number,
  pitch: number
};

enum MessageType {
  Init,
  State
}
