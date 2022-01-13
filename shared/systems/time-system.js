export default (world, now = performance.now()) => {
    const { time } = world;
    const delta = (now - time.then) / 1000;
    time.delta = delta;
    time.elapsed += delta;
    time.then = now;
    return world;
}
