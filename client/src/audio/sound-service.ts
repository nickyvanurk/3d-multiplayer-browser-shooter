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

// A continuously-looping 2D voice (e.g. the ship's engine). Unlike a one-shot it
// stays alive and inaudible until driven; `current` is smoothed toward `target`
// so the loop fades in/out instead of clicking on.
interface LoopVoice {
  sound: Audio;
  target: number;
  current: number;
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
  private readonly loops = new Map<string, LoopVoice>();
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

  // Register a looping 2D voice (the local ship's engine). It stays silent until
  // setLoopTarget drives it, and starts lazily on the first audible frame once
  // the audio context is running.
  setupLoop(name: string, pitch = 1): void {
    const buffer = this.buffers.get(name);
    if (!buffer) {
      return;
    }
    const sound = new Audio(this.listener);
    sound.setBuffer(buffer);
    sound.setLoop(true);
    sound.setPlaybackRate(pitch);
    sound.setVolume(0);
    this.loops.set(name, { sound, target: 0, current: 0 });
  }

  // Set a loop's desired gain; updateLoops smooths the actual volume toward it.
  setLoopTarget(name: string, target: number): void {
    const voice = this.loops.get(name);
    if (voice) {
      voice.target = target;
    }
  }

  setLoopPitch(name: string, pitch: number): void {
    this.loops.get(name)?.sound.setPlaybackRate(pitch);
  }

  // Advance every loop voice one frame: ease its volume toward the target (~150ms
  // time constant) and start the node the first time it becomes audible. Loops are
  // never stopped once started — they fade to silence and keep looping, so there
  // are no restart clicks when the player pulses the throttle.
  updateLoops(delta: number): void {
    const k = Math.min(1, delta / 150);
    for (const voice of this.loops.values()) {
      voice.current += (voice.target - voice.current) * k;
      if (this.listener.context.state !== 'running') {
        continue;
      }
      if (voice.current > 0.0005 && !voice.sound.isPlaying) {
        voice.sound.play();
      }
      voice.sound.setVolume(voice.current);
    }
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
