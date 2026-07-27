# INNOPROG IDE frontend

React/TypeScript frontend built with Vite.

## Development

```bash
npm ci
npm start
```

The development server listens on <http://localhost:3000>. Set `PORT` to use
another port. Requests to `/bot-api/check` and `/bot-api/code/run` are proxied
to the production-compatible IDE endpoint with the upstream Host header.

## Tests

```bash
npm test -- --runInBand
npm run test:contracts
```

## Production build

```bash
npm run build
```

Vite writes the static application to `dist/`. The production Docker image
builds that directory and serves it with nginx.

The public bundle reads `REACT_APP_BOT_API_URL`, `REACT_APP_WS_URL`,
`REACT_APP_PARENT_APP_ORIGIN`, and
`REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS` at build
time. `deploy/docker-compose.edge.yml` passes both values as Docker build
arguments; changing them requires rebuilding the frontend image.
