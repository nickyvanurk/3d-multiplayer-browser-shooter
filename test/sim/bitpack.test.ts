import assert from 'node:assert/strict';
import { test } from './harness.ts';
import { BitWriter, BitReader } from '../../shared/sim/net/bitpack.ts';

test('single field round-trips at every width 1..21', () => {
  for (let bits = 1; bits <= 21; bits++) {
    const max = (1 << bits) - 1;
    for (const value of [0, 1, max, max >> 1]) {
      const w = new BitWriter();
      w.writeBits(value, bits);
      const r = new BitReader(w.bytes());
      assert.equal(r.readBits(bits), value, `width ${bits} value ${value}`);
    }
  }
});

test('a mixed sequence round-trips across byte boundaries', () => {
  const fields: [number, number][] = [
    [1, 1],
    [1234567, 21],
    [0, 2],
    [42, 9],
    [65535, 16],
    [7, 3],
    [1048575, 21],
  ];
  const w = new BitWriter();
  for (const [value, bits] of fields) {
    w.writeBits(value, bits);
  }
  const r = new BitReader(w.bytes());
  for (const [value, bits] of fields) {
    assert.equal(r.readBits(bits), value);
  }
});

test('writeFloat64 byte-aligns and round-trips alongside bit fields', () => {
  const w = new BitWriter();
  w.writeBits(0xab, 8); // tag
  w.writeBits(3, 2); // unaligned bits before the float
  w.writeFloat64(1234.56789);
  w.writeBits(9, 4);
  const r = new BitReader(w.bytes());
  assert.equal(r.readBits(8), 0xab);
  assert.equal(r.readBits(2), 3);
  assert.ok(Math.abs(r.readFloat64() - 1234.56789) < 1e-9);
  assert.equal(r.readBits(4), 9);
});

test('bytes() length reflects the packed bit count (not byte-per-field)', () => {
  const w = new BitWriter();
  // 63 bits of position + 29 bits of quaternion = 92 bits -> 12 bytes (ceil)
  w.writeBits(0, 21);
  w.writeBits(0, 21);
  w.writeBits(0, 21);
  w.writeBits(0, 2);
  w.writeBits(0, 9);
  w.writeBits(0, 9);
  w.writeBits(0, 9);
  assert.equal(w.bytes().length, Math.ceil(92 / 8));
});
