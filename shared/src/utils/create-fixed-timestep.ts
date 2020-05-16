export default function createFixedTimestep(timestep: number, callback: Function) {
  let lag = 0;

  return (delta: number) => {
    lag += delta;

    while (lag >= timestep) {
      callback(timestep);
      lag -= timestep;
    }

    return lag / timestep;
  };
};
