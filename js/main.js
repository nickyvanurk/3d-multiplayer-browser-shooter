const MS_PER_UPDATE = 1000 / 60;

const game = new Game();

window.addEventListener('keydown', game.processEvents.bind(game));
window.addEventListener('keyup', game.processEvents.bind(game));
window.addEventListener('mousemove', game.processEvents.bind(game));

let previous = performance.now();
let lag = 0;

function gameLoop() {
  const current = performance.now();
  const elapsed = current - previous;

  previous = current;
  lag += elapsed;

  while (lag >= MS_PER_UPDATE && game.resourcesLoaded) {
    game.update();
    lag -= MS_PER_UPDATE;
  }

  game.render(lag / MS_PER_UPDATE);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
