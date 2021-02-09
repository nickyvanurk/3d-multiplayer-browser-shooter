import { System } from 'ecsy';

import Utils from '../../../shared/utils';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Player } from '../components/player';
import { Input } from '../components/input';

export class NetworkMessageSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    },
    mainPlayer: {
      components: [Connection, Player, Input]
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
      const component = entity.getComponent(Input);
      connection.pushMessage(new Messages.Input(component));
    });

    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      connection.sendOutgoingMessages();
    });
  }
}
