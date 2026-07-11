/**
 * Client/server clock synchronisation using the NetStorm algorithm
 * (Zachary Booth Simpson, http://www.mine-control.com/zack/timesync/timesync.html),
 * the same approach as TrinityCore's WorldSession::ComputeNewClockDelta().
 *
 * Per sample: latency = RTT/2, clockDelta = serverTime - receiveTime + latency.
 * Keep a bounded rolling window; discard samples with latency > median + 1 stddev
 * (eliminates transport spikes); arithmetic-mean the survivors' deltas. The first
 * sample is used immediately so the clock is in the right ballpark at once. A 25ms
 * hysteresis avoids re-adopting tiny delta wobble.
 */
interface Sample {
  latency: number;
  delta: number;
}

const WINDOW = 6; // bounded rolling window (TrinityCore uses a circular_buffer(6))
const HYSTERESIS_MS = 25; // only adopt a new delta when it moves more than this

export class TimeSyncManager {
  private readonly samples: Sample[] = []; // ring buffer; write index wraps at WINDOW
  private writeIndex = 0;
  private clockDelta = 0;
  private synced = false;

  onTimeResponse(
    sentTime: number,
    serverTime: number,
    receiveTime: number,
  ): void {
    const latency = (receiveTime - sentTime) / 2;
    const delta = serverTime - receiveTime + latency;

    this.samples[this.writeIndex % WINDOW] = { latency, delta };
    this.writeIndex++;

    if (!this.synced) {
      this.clockDelta = delta;
      this.synced = true;
      return;
    }

    const filtered = this.computeFilteredDelta();
    if (Math.abs(filtered - this.clockDelta) > HYSTERESIS_MS) {
      this.clockDelta = filtered;
    }
  }

  private computeFilteredDelta(): number {
    const latencies = this.samples.map((s) => s.latency).sort((a, b) => a - b);
    const median = latencies[Math.floor(latencies.length / 2)];
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance =
      latencies.reduce((a, l) => a + (l - mean) ** 2, 0) / latencies.length;
    const stdDev = Math.sqrt(variance);

    // `<=` (not `<`): on a steady connection successive latencies are equal so
    // stdDev is 0; a strict `<` would exclude every sample.
    const kept = this.samples.filter((s) => s.latency <= median + stdDev);
    if (kept.length === 0) return this.clockDelta;
    return kept.reduce((a, s) => a + s.delta, 0) / kept.length;
  }

  /** Clear all sync state. Call on (re)connect — a new server has an unrelated
   * performance.now() origin, so old samples/delta must be discarded. */
  reset(): void {
    this.samples.length = 0;
    this.writeIndex = 0;
    this.clockDelta = 0;
    this.synced = false;
  }

  /** Client estimate of the server's clock right now. */
  serverNow(): number {
    return performance.now() + this.clockDelta;
  }

  getClockDelta(): number {
    return this.clockDelta;
  }
  isSynced(): boolean {
    return this.synced;
  }
  getSampleCount(): number {
    return this.samples.length;
  }
}
