import { Component, Types as Types$1 } from 'ecsy';

import Types from '../../../../shared/types';

export class HelloMessage extends Component {
  static schema = {
    id: { type: Types$1.Number },
    name: { type: Types$1.String }
  };

  static deserialize(message) {
    return {
      id: message[0],
      name: message[1]
    };
  }
  
  serialize() {
    return [Types.Messages.HELLO, this.id, this.name];
  }
}

