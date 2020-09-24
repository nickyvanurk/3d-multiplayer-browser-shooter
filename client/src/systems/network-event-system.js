import { System } from 'ecsy';

import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    }
  };

  execute() {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.GO:
            connection.pushMessage(new Messages.Hello('Nicky'));
            break;
          case Types.Messages.WELCOME: {
            console.log(message.data);
            break;
          }
        }
      }
    });
  }
}
