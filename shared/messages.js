import Types from './types';

class Go {
  constructor() {}

  static deserialize(message) {}

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
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  static deserialize(message) {
    return {
      id: message[0],
      name: message[1]
    };
  }

  serialize() {
    return [Types.Messages.WELCOME, this.id, this.name];
  }
}


export default { Go, Hello, Welcome };
