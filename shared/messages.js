import { Vector3 } from 'three';

import Types from './types';

class Go {
  constructor() {}

  static deserialize() {}

  serialize() {
    return [Types.Messages.GO];
  }
}

class Hello {
  constructor(name) {
    this.name = name;
  }

  static deserialize(message) {
    return { name: message[0] };
  }
  
  serialize() {
    return [Types.Messages.HELLO, this.name];
  }
}

class Welcome {
  constructor(id, name, position, rotation) {
    this.id = id;
    this.name = name;
    this.position = position;
    this.rotation = rotation;
  }

  static deserialize(message) {
    return {
      id: message[0],
      name: message[1],
      position: new Vector3(message[2], message[3], message[4]),
      rotation: new Vector3(message[5], message[6], message[7]),
    };
  }

  serialize() {
    return [
      Types.Messages.WELCOME,
      this.id,
      this.name,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z
    ];
  }
}


export default { Go, Hello, Welcome };
