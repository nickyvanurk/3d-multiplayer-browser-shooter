import { System } from 'ecsy';

import { Connection } from '../components/connection';
import { HelloMessage } from '../components/messages/hello-message';

export class NetworkMessageSystem extends System {
  static queries = {
    helloMessages: {
      components: [HelloMessage],
      listen: { added: true }
    }
  };

  execute() {
    this.queries.helloMessages.added.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;
      const message = entity.getComponent(HelloMessage);
      connection.send(message.serialize());
      entity.removeComponent(HelloMessage);
    });
  }
}
