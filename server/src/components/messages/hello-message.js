import { Component, Types as Types$1 } from 'ecsy';

import Types from '../../../../shared/types';

export class HelloMessage extends Component {
  static schema = {
    id: { type: Types$1.Number },
    name: { type: Types$1.String }
  };
  
  serialize() {
    return [Types.Messages.HELLO, this.id, this.name];
  }
}

