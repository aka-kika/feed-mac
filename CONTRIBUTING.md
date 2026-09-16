# Contributing

Thanks for looking. Feed is a small personal tool with one maintainer, so
replies come when they come.

## Build and test

```bash
npm install
npm run build     # esbuild: dist/ for the browser, server/routes.mjs for Node
npm test          # tests/smoke.mjs against a throwaway data folder
npm start         # node server/main.mjs on 127.0.0.1:4318
```

Node.js 24 or newer. The smoke test never touches a real data folder.

## Issues and pull requests

- Issues are welcome: what you expected, what happened, macOS and Node
  versions, and the Feed version from Settings, About.
- Pull requests: one change per request, the smoke test passing, a sentence
  on why. Match what is already there: plain English, no emojis, sentence
  case.
- Publishing is a contract. `run_id`, `routine`, `title`, `markdown`, the
  status codes and the idempotent retry must keep working for every agent
  already connected, so changes to `lib/validation.ts`, `lib/server.ts` or
  `server/mcp.ts` need a smoke-test assertion and a clear reason.
- Feed listens on loopback and keys can only publish. Changes that open the
  reader to the network or let a key read reports will not be merged.

## License

MIT. By contributing you agree your work is released under the same license.
