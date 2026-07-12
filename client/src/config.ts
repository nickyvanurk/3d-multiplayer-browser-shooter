// Absolute base URL of the game server — it hosts both the WebSocket and the
// server-only assets (the music playlist). A build-time VITE_ASSET_BASE_URL
// wins: set it when the client is served off-server (e.g. CrazyGames' CDN) so
// the socket and music both point back at the game server. Otherwise the dev
// game server in dev, or same-origin in a combined Express deploy where the
// server serves the client too.
export function serverBaseUrl(): string {
  const configured = import.meta.env.VITE_ASSET_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:1337';
  }
  return `${location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '');
}

// The same server's WebSocket URL (http(s) -> ws(s)). The trailing slash keeps
// the path aligned with the nginx `/voidfall/` route in the combined deploy.
export function serverWebSocketUrl(): string {
  return `${serverBaseUrl().replace(/^http/, 'ws')}/`;
}
