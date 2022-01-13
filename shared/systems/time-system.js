export default (world) => {
    const { time } = world;
    const now = performance.now();
    const delta = (now - time.then) / 1000;
    time.delta = delta;
    time.elapsed += delta;
    time.then = now;
    return world;
}
