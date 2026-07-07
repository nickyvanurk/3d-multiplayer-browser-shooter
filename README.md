# [Voidfall](https://nickvanurk.com/voidfall)

A 3D multiplayer space dogfight game made with three.js and ws.

Play it at **[nickvanurk.com/voidfall](https://nickvanurk.com/voidfall)**.

<img src="docs/screenshot-v3.png">

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

* [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* [Node.js](https://nodejs.org/en/download/package-manager/)
* [npm](https://www.npmjs.com/get-npm)

### Installing

Clone Git repository

```
git clone https://github.com/nickyvanurk/voidfall.git
```

Install required npm modules

```
npm install
```

Start the game server

```
npm run server:start:dev
```

Start the web server

```
npm run client:start:dev
```

Surf to localhost:3000!

## Deployment

Deploys run via the **Deploy** GitHub Action (`workflow_dispatch`): it SSHes into the
server and runs `restart-voidfall.sh`, which pulls `master`, installs, builds the
client, and reloads the pm2 app. nginx serves the game under `/voidfall`.

## License

Copyright (c) 2020-2026 Nick van Urk. All Rights Reserved. This project is
proprietary — the source is public for reference only and may not be used,
copied, or distributed without written permission. See [LICENSE](./LICENSE).
