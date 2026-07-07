import IntervalWorker from './interval.worker.js?worker';

const worker = new IntervalWorker();
const callbacks = new Map();
let nextId = 0;

worker.onmessage = (event) => {
  const { name, id } = event.data || {};
  if (name === 'runCallback') {
    const callback = callbacks.get(id);
    if (callback) {callback();}
  }
};

export function setInterval(callback, delay) {
  const id = ++nextId;
  callbacks.set(id, callback);
  worker.postMessage({ name: 'setInterval', id, delay });
  return id;
}

export function clearInterval(id) {
  if (!callbacks.has(id)) {return;}
  callbacks.delete(id);
  worker.postMessage({ name: 'clearInterval', id });
}
