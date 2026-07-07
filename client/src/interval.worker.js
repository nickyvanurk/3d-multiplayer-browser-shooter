const scheduled = new Map();

onmessage = (event) => {
  const { name, id, delay } = event.data || {};

  switch (name) {
    case 'setInterval': {
      const intervalId = setInterval(() => postMessage({ name: 'runCallback', id }), delay);
      scheduled.set(id, intervalId);
      break;
    }
    case 'clearInterval': {
      clearInterval(scheduled.get(id));
      scheduled.delete(id);
      break;
    }
  }
};
