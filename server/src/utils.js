export function findFreeIndex(array, length) {
  for (let i = 0; i < length; ++i) {
    if (!array[i]) {
      return i;
    }
  }

  return -1;
}

export default {
  findFreeIndex,
};
