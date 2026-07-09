export interface Track {
  title: string;
  url: string;
}

// Playlist files, served from client/public/music. For first-time visitors
// "blade of grass" (index 0) is pinned first; everyone else gets a full shuffle
// (see buildOrder).
const MUSIC_FILES = [
  'blade of grass.wav',
  'Astroid.wav',
  'Boss Mode.wav',
  'Icebreaker.wav',
  'Long.wav',
  'Not Alone.wav',
  'chill house.wav',
  'edge.wav',
  'electric sunrise.wav',
  'neon green.wav',
  'tropic yo.wav',
  'voyage.wav',
] as const;

const VOLUME_KEY = 'voidfall.music.volume';

export function defaultPlaylist(): Track[] {
  return MUSIC_FILES.map((file) => ({
    title: file.replace(/\.wav$/i, ''),
    url: `music/${encodeURIComponent(file)}`,
  }));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Streaming background-music player. Unlike SoundService (short SFX loaded whole
// as AudioBuffers), music tracks are large files streamed through a single
// HTMLAudioElement. Order on the first cycle: for first-time visitors track 0
// ("blade of grass") is pinned first with the rest shuffled behind it, otherwise
// everything is shuffled. When the playlist is exhausted it reshuffles all
// tracks and continues.
export class MusicPlayer {
  private readonly audio = new Audio();
  private readonly tracks: Track[];
  private readonly pinFirstTrack: boolean;
  private order: number[] = [];
  private pos = 0;

  // Fired whenever the visible state changes (track, play/pause, volume) so the
  // HUD can refresh.
  onChange: (() => void) | null = null;

  constructor(tracks: Track[], pinFirstTrack = false) {
    this.tracks = tracks;
    this.pinFirstTrack = pinFirstTrack;
    this.audio.preload = 'auto';
    this.audio.volume = clamp01(loadVolume());
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('play', () => this.onChange?.());
    this.audio.addEventListener('pause', () => this.onChange?.());
    this.buildOrder(true);
  }

  get current(): Track {
    return this.tracks[this.order[this.pos]];
  }

  get playing(): boolean {
    return !this.audio.paused;
  }

  get volume(): number {
    return this.audio.volume;
  }

  // Load the first track and try to play. Browsers block audio before a user
  // gesture, so on rejection we retry once on the first pointer/key input.
  start(): void {
    this.loadCurrent();
    const p = this.audio.play();
    p?.catch(() => {
      const kick = () => {
        window.removeEventListener('pointerdown', kick);
        window.removeEventListener('keydown', kick);
        void this.audio.play().catch(() => {});
      };
      window.addEventListener('pointerdown', kick);
      window.addEventListener('keydown', kick);
    });
  }

  toggle(): void {
    if (this.audio.paused) {
      void this.audio.play().catch(() => {});
    } else {
      this.audio.pause();
    }
  }

  next(): void {
    if (this.pos + 1 >= this.order.length) {
      this.buildOrder(false, this.order[this.pos]);
      this.pos = 0;
    } else {
      this.pos++;
    }
    this.playCurrent();
  }

  prev(): void {
    // A few seconds into a track, "previous" restarts it (standard media-player
    // feel); otherwise it steps back, wrapping to the end of the shuffle order.
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
    } else {
      this.pos = (this.pos - 1 + this.order.length) % this.order.length;
      this.playCurrent();
    }
  }

  changeVolume(delta: number): void {
    this.audio.volume = clamp01(
      Math.round((this.audio.volume + delta) * 100) / 100,
    );
    saveVolume(this.audio.volume);
    this.onChange?.();
  }

  private playCurrent(): void {
    this.loadCurrent();
    void this.audio.play().catch(() => {});
  }

  private loadCurrent(): void {
    this.audio.src = this.current.url;
    this.onChange?.();
  }

  // Build the play order. On the first cycle, first-time visitors get track 0
  // ("blade of grass") pinned in front of a shuffled tail; everyone else gets a
  // full shuffle. Later cycles shuffle everything, avoiding an immediate repeat
  // of `last` (the track that just finished) as the new first track.
  private buildOrder(firstCycle: boolean, last = -1): void {
    if (firstCycle && this.pinFirstTrack) {
      this.order = [0, ...shuffle(range(1, this.tracks.length))];
      return;
    }
    const next = shuffle(range(0, this.tracks.length));
    if (this.tracks.length > 1 && next[0] === last) {
      [next[0], next[1]] = [next[1], next[0]];
    }
    this.order = next;
  }
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) {
    out.push(i);
  }
  return out;
}

function shuffle(arr: number[]): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DEFAULT_VOLUME = 0.2;

function loadVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY);
  const v = raw === null ? DEFAULT_VOLUME : Number(raw);
  return Number.isFinite(v) ? clamp01(v) : DEFAULT_VOLUME;
}

function saveVolume(v: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // localStorage may be unavailable (private mode / quota); ignore.
  }
}
