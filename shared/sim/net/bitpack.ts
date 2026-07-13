// MSB-first bit writer/reader over a byte buffer. Fields up to 24 bits (JS bitwise
// ops are 32-bit); positions are 21, ids/velocities 16, so all fields fit.
// writeFloat64/readFloat64 byte-align first, so an 8-byte double can share a frame
// with bit-packed fields.

export class BitWriter {
  private out: number[] = [];
  private cur = 0;
  private nbits = 0;

  writeBits(value: number, bits: number): void {
    value = value >>> 0;
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >>> i) & 1);
      if (++this.nbits === 8) {
        this.out.push(this.cur & 0xff);
        this.cur = 0;
        this.nbits = 0;
      }
    }
  }

  private align(): void {
    if (this.nbits > 0) {
      this.cur <<= 8 - this.nbits;
      this.out.push(this.cur & 0xff);
      this.cur = 0;
      this.nbits = 0;
    }
  }

  writeFloat64(value: number): void {
    this.align();
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, false);
    for (let i = 0; i < 8; i++) {
      this.out.push(view.getUint8(i));
    }
  }

  bytes(): Uint8Array {
    this.align();
    return Uint8Array.from(this.out);
  }
}

export class BitReader {
  private pos = 0; // bit position

  constructor(private buf: Uint8Array) {}

  readBits(bits: number): number {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.buf[this.pos >> 3];
      const bit = (byte >> (7 - (this.pos & 7))) & 1;
      value = (value << 1) | bit;
      this.pos++;
    }
    return value >>> 0;
  }

  private align(): void {
    this.pos = (this.pos + 7) & ~7;
  }

  readFloat64(): number {
    this.align();
    const view = new DataView(
      this.buf.buffer,
      this.buf.byteOffset + (this.pos >> 3),
      8,
    );
    this.pos += 64;
    return view.getFloat64(0, false);
  }

  get bitPos(): number {
    return this.pos;
  }
}
