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

export class Spawn {
  constructor(id, kind, position, rotation) {
    this.id = id;
    this.kind = kind;
    this.position = position;
    this.rotation = rotation;
  }

  static deserialize(message) {
    return {
      id: message[0],
      kind: message[1],
      position: new Vector3(message[2], message[3], message[4]),
      rotation: new Vector3(message[5], message[6], message[7])
    };
  }

  serialize() {
    return [
      Types.Messages.SPAWN,
      this.id,
      this.kind,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z
    ];
  }
}

export class Despawn {
  constructor(id) {
    this.id = id;
  }

  static deserialize(message) {
    return { id: message[0] };
  }
  
  serialize() {
    return [Types.Messages.DESPAWN, this.id];
  }
}

export class Input {
  constructor({ movementX, movementY, movementZ, roll, yaw, pitch, boost }) {
    this.movementX = movementX;
    this.movementY = movementY;
    this.movementZ = movementZ;
    this.roll = roll;
    this.yaw = yaw;
    this.pitch = pitch;
    this.boost = boost;
  }
  
  static deserialize(message) {
    return {
      movementX: message[0],
      movementY: message[1],
      movementZ: message[2],
      roll: message[3],
      yaw: message[4],
      pitch: message[5],
      boost: message[6],
    };
  }
  
  serialize() {
    return [
      Types.Messages.INPUT,
      this.movementX,
      this.movementY,
      this.movementZ,
      this.roll,
      this.yaw,
      this.pitch,
      this.boost
    ];
  }
}

class World {
  constructor(entities) {
    this.entities = entities;
  }

  static deserialize(message) {
    const data = [];

    for (let i = 0; i < message[0]; ++i) {
      const index = i*6; 

      data.push({
        position: new Vector3(message[index + 1], message[index + 1], message[index + 2]),
        rotation: new Vector3(message[index + 3], message[index + 4], message[index + 6]) 
      });
    }

    return data;
  }
  
  serialize() {
    const data = [Types.Messages.WORLD, this.entities.length];

    for (let i = 0; i < this.entities.length; ++i) {
      const transform = this.entities[i].getComponent(Transform);

      data.push(transform.position.x); 
      data.push(transform.position.y); 
      data.push(transform.position.z); 
      data.push(transform.rotation.x); 
      data.push(transform.rotation.y); 
      data.push(transform.rotation.z); 
    }

    return data;
  }
}

export default { Go, Hello, Welcome, Spawn, Despawn, Input, World };
