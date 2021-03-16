import sanitizeHtml from 'sanitize-html';
import { Vector3, Quaternion } from 'three';

export default {
  sanitize: (string) => {
    return sanitizeHtml(string);
  },

  random: (range) => {
    return Math.floor(Math.random() * range);
  },

  getRandomPosition(size, rng = Math.random) {
    return new Vector3((rng() - 0.5) * size, (rng() - 0.5) * size, (rng() - 0.5) * size);
  },

  getRandomQuaternion(rng = Math.random) {
    rng = !!rng ? rng : Math.random;
    const quaternion = new Quaternion();
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), rng() * Math.PI * 2);
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2);
    quaternion.setFromAxisAngle(new Vector3(0, 0, 1), rng() * Math.PI * 2);
    return quaternion;
  },

  createFixedTimestep(timestep, callback) {
    let lag = 0;

    return (delta, time) => {
      lag += delta;

      while (lag >= timestep) {
        callback(timestep, time);
        lag -= timestep;
      }

      return lag / timestep;
    };
  },

  randomNumberGenerator(seed) {
    const mask = 0xffffffff;
    let m_w  = (123456789 + seed) & mask;
    let m_z  = (987654321 - seed) & mask;

    return function() {
      m_z = (36969 * (m_z & 65535) + (m_z >>> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >>> 16)) & mask;

      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  },

  startWorldExecution(world) {
    world.play();
    world.getSystems().forEach(system => system.play());
  },

  stopWorldExecution(world) {
    world.stop();
    world.getSystems().forEach(system => system.stop());
  }
};

