export default function createFixedTimestep(timestep: number, callback: Function) {
  let lag = 0;

  return (delta: number, time: number) => {
    lag += delta;

    while (lag >= timestep) {
      callback(timestep, time);
      lag -= timestep;
    }

    return lag / timestep;
  };
};
