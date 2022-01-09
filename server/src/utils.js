export function findFreeIndex(array) {
  for (let i = 0; i < array.length; ++i) {
    if (!array[i]) {
      return i;
    }
  }

  return -1;
}

export default {
  findFreeIndex,
};
