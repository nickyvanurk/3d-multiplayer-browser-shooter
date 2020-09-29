import sanitizeHtml from 'sanitize-html';
import { Vector3 } from 'three';

export default {
  sanitize: (string) => {
    return sanitizeHtml(string);
  },
  random: (range) => {
    return Math.floor(Math.random() * range);
  },
  getRandomRotation() {
    return new Vector3(
      this.random(360) * Math.PI/180,
      this.random(360) * Math.PI/180,
      this.random(360) * Math.PI/180
    );
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
  }
};

