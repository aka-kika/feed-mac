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
- Feed listens on loopback and keys publish. Reading is off unless the owner
  lists a source in `readSources`, and it answers only on the read door, a
  second loopback listener that no tunnel or proxy forwards to.
  Changes that open the reader to the network, let a key read from anywhere
  else, or let a key change Saved or tick a box will not be merged. A key that
  can read also gets the owner's comments and ticks, as `owner_notes` and
  `ticks` on the one report it opens with `get_report`, and nowhere else.

## License

MIT. By contributing you agree your work is released under the same license.
