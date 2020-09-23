import { System } from 'ecsy';

import Types from '../../../shared/types';
import Utils from '../../../shared/utils';
import { Connection } from '../components/connection';
import { NetworkEvent } from '../components/network-event';
import { HelloMessage } from '../components/messages/hello-message';

export class NetworkEventSystem extends System {
  static queries = {
    networkEvents: {
      components: [NetworkEvent],
      listen: { added: true }
    }
  };

  execute() {
    this.queries.networkEvents.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      const event = entity.getComponent(NetworkEvent);

      switch (event.type) {
        case Types.Messages.HELLO: {
          const message = HelloMessage.deserialize(event.message);

          message.id = connection.id;
          message.name = Utils.sanitize(message.name); 
          message.name = !message.name ? 'UNKNOWN' : message.name.substr(0, 15);  

          entity.addComponent(HelloMessage, message);
          break;
        }
      }

      entity.removeComponent(NetworkEvent);
    });
  }
}
