export const Messages = {
  GO: 0,
  HELLO: 1,
  WELCOME: 2,
  SPAWN: 3,
  DESPAWN: 4,
  WORLD: 6,
  STATE: 7,
  FIRE: 8,
} as const;

export const Entities = {
  SPACESHIP: 0,
  ASTEROID: 1,
  BULLET: 2,
} as const;

export type MessageId = (typeof Messages)[keyof typeof Messages];
export type EntityKind = (typeof Entities)[keyof typeof Entities];

export default { Messages, Entities };
