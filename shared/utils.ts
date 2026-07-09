import { Vector3, Quaternion } from 'three';

type Rng = () => number;

export default {
  random: (range: number): number => {
    return Math.floor(Math.random() * range);
  },

  getRandomPosition(size: number, rng: Rng = Math.random): Vector3 {
    return new Vector3(
      (rng() - 0.5) * size,
      (rng() - 0.5) * size,
      (rng() - 0.5) * size,
    );
  },

  getRandomQuaternion(rng?: Rng): Quaternion {
    rng = rng ? rng : Math.random;
    const quaternion = new Quaternion();
    quaternion.setFromAxisAngle(new Vector3(1, 0, 0), rng() * Math.PI * 2);
    quaternion.setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2);
    quaternion.setFromAxisAngle(new Vector3(0, 0, 1), rng() * Math.PI * 2);
    return quaternion;
  },

  createFixedTimestep(
    timestep: number,
    callback: (dt: number, time: number) => void,
  ): (delta: number) => number {
    let lag = 0;
    // Deterministic sim clock: advances by exactly `timestep` per sub-step so
    // time-based game logic (weapon cadence) depends only on dt, not wall-clock.
    let elapsed = 0;

    return (delta) => {
      lag += delta;

      while (lag >= timestep) {
        elapsed += timestep;
        callback(timestep, elapsed);
        lag -= timestep;
      }

      return lag / timestep;
    };
  },

  randomNumberGenerator(seed: number): Rng {
    const mask = 0xffffffff;
    let m_w = (123456789 + seed) & mask;
    let m_z = (987654321 - seed) & mask;

    return () => {
      m_z = (36969 * (m_z & 65535) + (m_z >>> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >>> 16)) & mask;

      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  },
};
