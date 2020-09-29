import { System } from 'ecsy';

import Utils from '../../../shared/utils';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { PlayerInputState } from '../components/player-input-state';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    },
    mainPlayer: {
      components: [Connection, PlayerInputState]
    }
  };

  init() {
    this.fixedUpdate = Utils.createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
  }

  execute(delta) {
    this.fixedUpdate(delta);
  }

  handleFixedUpdate() {
    this.queries.mainPlayer.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      const component = entity.getComponent(PlayerInputState);
      connection.pushMessage(new Messages.Input(component));
    });

    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.sendOutgoingMessages();
    });
  }
}
