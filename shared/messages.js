import { Vector3 } from 'three';

import Types from './types';
import { Transform } from './components/transform';

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
  constructor(id, name, position, rotation, players) {
    this.id = id;
    this.name = name;
    this.position = position;
    this.rotation = rotation;
    this.players = players;
  }

  static deserialize(message) {
    const data = {
      id: message[0],
      name: message[1],
      position: new Vector3(message[2], message[3], message[4]),
      rotation: new Vector3(message[5], message[6], message[7]),
      players: []
    };

    for (let i = 0; i < message[8]; ++i) {
      const index = 9 + 6*i;
      data.players.push({
        position: new Vector3(message[index], message[index + 1], message[index + 2]),
        rotation: new Vector3(message[index + 3], message[index + 4], message[index + 5]),
      });
    }

    return data;
  }

  serialize() {
    const data = [
      Types.Messages.WELCOME,
      this.id,
      this.name,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.players.length
    ];
    
    for (const entity of this.players) {
      const component = entity.getComponent(Transform);
      const position = component.position;
      const rotation = component.rotation;
      
      data.push(position.x);
      data.push(position.y);
      data.push(position.z);
      data.push(rotation.x);
      data.push(rotation.y);
      data.push(rotation.z);
    }

    return data;
  }
}

export class Spawn {
  constructor(position, rotation) {
    this.position = position;
    this.rotation = rotation;
  }

  static deserialize(message) {
    return {
      position: new Vector3(message[0], message[1], message[2]),
      rotation: new Vector3(message[3], message[4], message[5])
    };
  }

  serialize() {
    return [
      Types.Messages.SPAWN,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z
    ];
  }
}

export default { Go, Hello, Welcome, Spawn };
