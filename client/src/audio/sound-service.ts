import {
  AudioListener,
  Audio,
  PositionalAudio,
  AudioLoader,
  Vector3,
} from 'three';
import type { Camera, Scene } from 'three';

export interface SoundSegment {
  offset: number;
  duration: number;
}

// Spatial SFX via three.js. An AudioListener rides the camera; positional
// one-shots pan/attenuate by distance (remote players' shots), while plain 2D
// one-shots stay centered (the local player's own shots). A clip may pack many
// sounds separated by silence (e.g. a "blaster-multiple" pack) — load() splits
// it into selectable segments so a debug panel can audition each one.
export class SoundService {
  // Live-tunable base pitch + volume (the F3 sliders drive these); the BFH
  // per-shot jitter is applied on top of them.
  pitch = 1;
  volume = 1;

  private readonly listener: AudioListener;
  private readonly scene: Scene;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly segments = new Map<string, SoundSegment[]>();
  private readonly active = new Map<string, number>();
  private readonly listenerPos = new Vector3();

  constructor(camera: Camera, scene: Scene) {
    this.listener = new AudioListener();
    camera.add(this.listener);
    this.scene = scene;

    const resume = () => {
      if (this.listener.context.state === 'suspended') {
        void this.listener.context.resume();
      }
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  async load(name: string, url: string): Promise<void> {
    const buffer = await new AudioLoader().loadAsync(url);
    this.buffers.set(name, buffer);
    const segs = this.split(buffer);
    this.segments.set(
      name,
      segs.length ? segs : [{ offset: 0, duration: buffer.duration }],
    );
    this.active.set(name, 0);
  }

  getSegments(name: string): SoundSegment[] {
    return this.segments.get(name) ?? [];
  }

  getActive(name: string): number {
    return this.active.get(name) ?? 0;
  }

  setActive(name: string, index: number): void {
    this.active.set(name, index);
  }

  // 2D one-shot of the active segment — centered, for the local player's own SFX.
  // An optional `pitch` overrides the global base pitch for this one clip.
  play(name: string, volume = 1, pitch?: number): void {
    this.spawn(name, this.resolve(name), null, volume, pitch);
  }

  // Positional one-shot of the active segment at a world position. An optional
  // `pitch` overrides the global base pitch for this one clip; `refDistance`
  // (default 30) sets how far the sound carries before it starts attenuating —
  // a large value keeps big events (explosions) audible across the battlefield.
  // `maxDistance` (default 1000 ≈ 1km) is a hard cutoff: the three.js inverse
  // rolloff only asymptotes toward zero, so a distant event stays faintly
  // audible forever; past this range we just don't play it at all.
  playAt(
    name: string,
    position: Vector3,
    volume = 1,
    pitch?: number,
    refDistance = 30,
    maxDistance = 1000,
  ): void {
    this.spawn(
      name,
      this.resolve(name),
      position,
      volume,
      pitch,
      refDistance,
      maxDistance,
    );
  }

  // The segment to fire: the chosen one, or a fresh random pick when active < 0
  // (BFH-style random selection — a pack of shots cycled at random reads far less
  // repetitive than one sample, on top of the per-shot pitch/volume jitter).
  private resolve(name: string): number {
    const active = this.getActive(name);
    if (active >= 0) {
      return active;
    }
    const count = this.segments.get(name)?.length ?? 0;
    return Math.floor(Math.random() * count);
  }

  // 2D audition of a specific segment (debug panel), independent of the active one.
  preview(name: string, index: number, volume = 1): void {
    this.spawn(name, index, null, volume);
  }

  private spawn(
    name: string,
    index: number,
    position: Vector3 | null,
    volume: number,
    pitch?: number,
    refDistance = 30,
    maxDistance?: number,
  ): void {
    const buffer = this.buffers.get(name);
    const seg = this.segments.get(name)?.[index];
    if (!buffer || !seg || this.listener.context.state !== 'running') {
      return;
    }

    // Hard distance cutoff: skip positional events emitted beyond maxDistance
    // from the listener (they'd otherwise linger faintly under the inverse
    // rolloff). Local 2D sounds have no position and are never gated.
    if (
      position &&
      maxDistance !== undefined &&
      this.listener.getWorldPosition(this.listenerPos).distanceTo(position) >
        maxDistance
    ) {
      return;
    }

    const sound = position
      ? new PositionalAudio(this.listener)
      : new Audio(this.listener);
    sound.setBuffer(buffer);
    sound.offset = seg.offset;
    sound.duration = seg.duration;
    // Battlefield Heroes anti-repetition: a fresh random pitch + volume per shot
    // (pitchEnvelope 0.97–1.03, volumeEnvelope 0.9–1.0) around the tunable base,
    // so rapid fire varies shot-to-shot instead of being a dead-identical repeat.
    sound.setPlaybackRate(
      (pitch ?? this.pitch) * (0.97 + Math.random() * 0.06),
    );
    sound.setVolume(volume * this.volume * (0.9 + Math.random() * 0.1));

    if (position && sound instanceof PositionalAudio) {
      sound.setRefDistance(refDistance);
      sound.position.copy(position);
      this.scene.add(sound);
      sound.onEnded = () => {
        sound.isPlaying = false;
        this.scene.remove(sound);
      };
    } else {
      sound.onEnded = () => {
        sound.isPlaying = false;
      };
    }
    sound.play();
  }

  // Split a buffer into non-silent regions (10ms RMS frames, ~-40dB gate, gaps
  // under 120ms bridged so a sound's own quiet moments don't fragment it).
  private split(buffer: AudioBuffer): SoundSegment[] {
    const sr = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const hop = Math.max(1, Math.floor(sr * 0.01));
    const frames = Math.floor(data.length / hop);
    const threshold = 0.01;
    const bridge = Math.round((0.12 * sr) / hop);
    const minFrames = Math.round((0.05 * sr) / hop);

    const active = new Array<boolean>(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const start = f * hop;
      for (let i = 0; i < hop; i++) {
        const v = data[start + i];
        sum += v * v;
      }
      active[f] = Math.sqrt(sum / hop) > threshold;
    }

    const segs: SoundSegment[] = [];
    let f = 0;
    while (f < frames) {
      if (!active[f]) {
        f++;
        continue;
      }
      const start = f;
      let end = f;
      let quiet = 0;
      while (f < frames) {
        if (active[f]) {
          end = f;
          quiet = 0;
        } else if (++quiet > bridge) {
          break;
        }
        f++;
      }
      if (end - start >= minFrames) {
        const offset = (start * hop) / sr;
        segs.push({ offset, duration: ((end + 1) * hop) / sr - offset });
      }
    }
    return segs;
  }
}
