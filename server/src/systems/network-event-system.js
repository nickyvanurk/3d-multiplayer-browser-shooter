import { System, Not } from 'ecsy';

import Utils from '../../../shared/utils';
import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { Kind } from '../../../shared/components/kind';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection, Not(PlayerInputState)]
    },
    players: {
      components: [Connection, PlayerInputState]
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

            this.worldServer.addPlayer(connection.id);

            const { position, rotation, scale } = entity.getComponent(Transform);
            const kind = entity.getComponent(Kind).value;
            connection.pushMessage(new Messages.Welcome(
              entity.worldId,
              name,
              kind,
              position,
              rotation,
              scale
            ));

            this.worldServer.broadcast(new Messages.Spawn(
              entity.worldId,
              kind,
              position,
              rotation,
              scale
            ), connection.id);
            break;
          }
        }
      }
    });

    this.queries.players.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
        
      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.INPUT: {
            const {
              movementX,
              movementY,
              movementZ,
              roll,
              yaw,
              pitch,
              boost
            } = message.data;
            const component = entity.getMutableComponent(PlayerInputState);
            
            component.movementX = movementX;
            component.movementY = movementY;
            component.movementZ = movementZ;
            component.roll = roll;
            component.yaw = yaw;
            component.pitch = pitch;
            component.boost = boost;
            break;
          }
        }
      }
    });
  }
}
