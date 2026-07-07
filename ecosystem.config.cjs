// PM2 process definition for the nickvanurk.com/voidfall deployment.
//
// A single combined server: Express serves the built client (client/dist) and
// hosts the game WebSocket on the same port. nginx proxies /voidfall/ to it.
// PRODUCTION=true enables the static-serving branch in server/src/server.js.

module.exports = {
  apps: [
    {
      name: 'voidfall',
      script: 'server/src/index.js',
      interpreter: './node_modules/.bin/babel-node',
      cwd: __dirname,
      env: {
        PRODUCTION: 'true',
        PORT: '3003',
      },
    },
  ],
}
