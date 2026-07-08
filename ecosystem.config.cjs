// PM2 process definition for the nickvanurk.com/voidfall deployment.
//
// A single combined server: Express serves the built client (client/dist) and
// hosts the game WebSocket on the same port. nginx proxies /voidfall/ to it.
// Runs the TypeScript entry directly via tsx (no build step); PRODUCTION=true
// enables the static-serving branch in the server.

module.exports = {
  apps: [
    {
      name: 'voidfall',
      script: './node_modules/.bin/tsx',
      args: 'server/src/index.ts',
      cwd: __dirname,
      env: {
        PRODUCTION: 'true',
        PORT: '3003',
      },
    },
  ],
};
