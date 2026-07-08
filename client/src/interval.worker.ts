// Requests posted to this worker by worker-interval.ts.
interface IntervalWorkerRequest {
  name?: 'setInterval' | 'clearInterval';
  id?: number;
  delay?: number;
}

const scheduled = new Map<number | undefined, ReturnType<typeof setInterval>>();

self.onmessage = (event: MessageEvent<IntervalWorkerRequest>) => {
  const { name, id, delay }: IntervalWorkerRequest = event.data || {};

  switch (name) {
    case 'setInterval': {
      const intervalId = setInterval(
        () => postMessage({ name: 'runCallback', id }),
        delay,
      );
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
