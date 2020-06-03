import { System } from 'ecsy';

import { PlayerInputState } from '../components/player-input-state';
import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class NetworkSystem extends System {
  static queries: any = {
    playerInputState: {
      components: [PlayerInputState]
    }
  };

  private socket: WebSocket;
  private fixedUpdate: Function;

  init() {
    this.socket = new WebSocket(`ws://${process.env.SERVER_URL}`);

    this.socket.onopen = this.handleConnect.bind(this);
    this.socket.onclose = this.handleDisconnect.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);

    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
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
    console.log(`Message from server ${event.data}`);
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
