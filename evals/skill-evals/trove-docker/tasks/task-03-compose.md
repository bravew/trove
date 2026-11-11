# Task: docker-compose for local dev

Write a `docker-compose.yml` with services `app`, `postgres:16`, `redis:7`. Mount source code into `app` for hot reload. Use a `.env` file for secrets — don't commit them or bake into images.

`app` is a fictional Node 22 API with `package.json`, `package-lock.json`, and `src/`. Hot reload runs `npm run dev`; production runs `node dist/server.js` after `npm run build`. Write the `Dockerfile` that compose builds as well. The same file must serve both local dev and the production image, and the hot-reload container must not run as root while still able to read the mounted source.
