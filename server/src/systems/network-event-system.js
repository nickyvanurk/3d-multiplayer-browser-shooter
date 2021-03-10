import { System, Not } from 'ecsy';

import Utils from '../../../shared/utils';
import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Input } from '../../../shared/components/input';
import { Kind } from '../../../shared/components/kind';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection, Input]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.HELLO: {
            let { name } = message.data;
            name = Utils.sanitize(name);
            name = !name ? 'UNKNOWN' : name.substr(0, 15);

            const spaceship = this.worldServer.addPlayer(connection.id);
            connection.pushMessage(new Messages.Welcome(spaceship.id, name));
            break;
          }
          case Types.Messages.INPUT: {
            const {
              forward, backward,
              rollLeft, rollRight,
              strafeLeft, strafeRight, strafeUp, strafeDown,
              boost, weaponPrimary, aim
            } = message.data;
            const component = entity.getMutableComponent(Input);

            component.forward = forward;
            component.backward = backward;
            component.rollLeft = rollLeft;
            component.rollRight = rollRight;
            component.strafeLeft = strafeLeft;
            component.strafeRight = strafeRight;
            component.strafeUp = strafeUp;
            component.strafeDown = strafeDown;
            component.boost = boost;
            component.weaponPrimary = weaponPrimary;
            component.aim = aim;
            break;
          }
        }
      }
    });
  }
}
