/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Absolute base URL of the game server that hosts server-only assets (the
  // music playlist). Set at build time when the client is served off-server
  // (e.g. CrazyGames). Unset -> same-origin / dev fallback (see music-player.ts).
  readonly VITE_ASSET_BASE_URL?: string;
}
