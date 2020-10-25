import { Vector3, Quaternion } from 'three';

import Types from './types';
import { Transform } from '../server/src/components/transform';

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
  constructor(id, name, kind, position, rotation, scale) {
    this.id = id;
    this.name = name;
    this.kind = kind;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }

  static deserialize(message) {
    return {
      id: message[0],
      name: message[1],
      kind: message[2],
      position: new Vector3(message[3], message[4], message[5]),
      rotation: new Vector3(message[6], message[7], message[8]),
      scale: message[9]
    };
  }

  serialize() {
    return [
      Types.Messages.WELCOME,
      this.id,
      this.name,
      this.kind,
      this.position.x,
      this.position.y,
      this.position.z,
      this.rotation.x,
      this.rotation.y,
      this.rotation.z,
      this.scale
    ];
  }
}

export class Spawn {
  constructor(id, kind, position, rotation, scale) {
    this.id = id;
    this.kind = kind;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }

  static deserialize(message) {
    return {
      id: message[0],
      kind: message[1],
      position: new Vector3(message[2], message[3], message[4]),
      rotation: new Vector3(message[5], message[6], message[7]),
      scale: message[8]
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
      this.rotation.z,
      this.scale
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
  constructor({ movementX, movementY, movementZ, roll, yaw, pitch, boost, weaponPrimary }) {
    this.movementX = movementX;
    this.movementY = movementY;
    this.movementZ = movementZ;
    this.roll = roll;
    this.yaw = yaw;
    this.pitch = pitch;
    this.boost = boost;
    this.weaponPrimary = weaponPrimary;
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
      weaponPrimary: message[7],
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
      this.boost,
      this.weaponPrimary
    ];
  }
}

class World {
  constructor(entities) {
    this.entities = entities;
  }

  static deserialize(message) {
    const data = [];

    for (let i = 0; i < message.length; i += 8) {
      data.push({
        id: message[i],
        position: new Vector3(message[i + 1], message[i + 2], message[i + 3]),
        rotation: new Quaternion(message[i + 4], message[i + 5], message[i + 6], message[i + 7])
      });
    }

    return data;
  }

  serialize() {
    const data = [Types.Messages.WORLD];

    for (let i = 0; i < this.entities.length; ++i) {
      if (!this.entities[i]) {
        continue;
      }

      data.push(this.entities[i].worldId);

      const transform = this.entities[i].getComponent(Transform);

      data.push(transform.position.x);
      data.push(transform.position.y);
      data.push(transform.position.z);
      data.push(transform.rotation.x);
      data.push(transform.rotation.y);
      data.push(transform.rotation.z);
      data.push(transform.rotation.w);
    }

    return data;
  }
}

export default { Go, Hello, Welcome, Spawn, Despawn, Input, World };
