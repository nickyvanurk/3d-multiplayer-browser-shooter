import IntervalWorker from './interval.worker.ts?worker';

// Messages posted back by interval.worker.ts when a scheduled interval fires.
interface WorkerCallbackMessage {
  name?: string;
  id?: number;
}

const worker = new IntervalWorker();
const callbacks = new Map<number | undefined, () => void>();
let nextId = 0;

worker.onmessage = (event: MessageEvent<WorkerCallbackMessage>) => {
  const { name, id }: WorkerCallbackMessage = event.data || {};
  if (name === 'runCallback') {
    const callback = callbacks.get(id);
    if (callback) {
      callback();
    }
  }
};

export function setInterval(callback: () => void, delay: number): number {
  const id = ++nextId;
  callbacks.set(id, callback);
  worker.postMessage({ name: 'setInterval', id, delay });
  return id;
}

export function clearInterval(id: number): void {
  if (!callbacks.has(id)) {
    return;
  }
  callbacks.delete(id);
  worker.postMessage({ name: 'clearInterval', id });
}
