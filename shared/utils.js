export function createFixedTimestep(timestep, callback) {
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
