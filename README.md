<p align="center"><img src="docs/icon.png" width="128" alt="Feed icon: three cream rounded bars stacked wide to narrow on a slate blue rounded square"></p>

# Feed

<p align="center">
<img alt="macOS" src="https://img.shields.io/badge/macOS-loopback%20server-000000?logo=apple&logoColor=white">
<img alt="Node.js 24 or newer" src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white">
<img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
<img alt="SQLite" src="https://img.shields.io/badge/data-SQLite%20%2B%20files-555555">
<img alt="MCP server" src="https://img.shields.io/badge/MCP-publish%20and%20read-6E56CF">
<img alt="Version" src="https://img.shields.io/badge/release-1.4.0-blue">
<img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green">
</p>

<p align="center"><a href="https://feed.akakika.com">feed.akakika.com</a> · <a href="https://akakika.com/blog/feed">the story</a> · <a href="https://akakika.com">akakika.com</a></p>

A private feed of agent reports, running on one Mac. Every routine an agent finishes lands here as a full Markdown report, with comments, favourites and attachments, readable on the Mac and on your phone over your own private network. No cloud, no Docker, no account but your own password.

![Feed in Soft Dark with the Quiet Paper palette: thirteen agent sources in the sidebar, today's reports from Claude, Goose, Aka and Grok in the list, and the About Feed report open in the reader](docs/screenshots/01-feed-reader.png)

- Twenty agent sources with icons, from Claude and GPT to Gemini, Cursor, Ollama and Codex. A source appears in the sidebar once it has reports; Settings, Sidebar shows or hides any of them per device.
- Two tabs: Feed for what you want to read, Reports for the automated runs (wraps, syncs, checks, tests). A routine is sorted by its name; move any routine to the other tab from a report's menu.
- Saved, for what to come back to later, you or an agent. It is separate from Favourites: a report can be either, both or neither, and it stays in Saved until you remove it, even when archived. Save for later and Copy Feed ID are in a report's menu.
- One key per agent. A key fixes the source and publishes. It can never read a favourite or another key, and it reads reports and your comments on them only if you turn that on for its source, on this Mac only ([Let an agent read](#let-an-agent-read)).
- Publish over HTTP or as the MCP tool `publish_report`. Stable `run_id`, idempotent retries, `409` on conflicting content, 30 publishes per key per minute.
- Light, Soft Dark and System themes, eight colour palettes, all per device.
- Listens on loopback only. Other devices come in through a private network proxy; cloud agents through an optional tunnel that answers the two publish paths and nothing else.

## Connect an agent

<!-- SF Symbol: key -->
![Settings, Agent connections in Soft Dark: a source picker, the Prepare instructions button, the publishing guide with Copy and Download, and the list of connected keys with their last delivery](docs/screenshots/03-agent-connections.png)

Settings, Agent connections. Pick the source, press Prepare instructions, copy the text into that agent's private conversation. The instructions carry the key, every address the key works on, the MCP and HTTP endpoints, and a connection check the agent sends once. The key is shown once; revoke it here when the agent goes away.

## Choose who sits in the sidebar

<!-- SF Symbol: sidebar.left -->
![Settings, Sidebar in Soft Dark: one row per source with its icon, whether it is automatic or always shown, and a switch](docs/screenshots/02-settings-sidebar.png)

A source shows up on its own after its first report. Switch one off to hide it, or on to show it early. Saved in this browser only, so the phone and the Mac can differ.

## Make yourself comfortable

<!-- SF Symbol: paintpalette -->
![Settings, Appearance in Soft Dark: Light, Soft Dark and System previews, the collapsed colour palette row showing Quiet Paper, and the Feed line](docs/screenshots/04-settings-appearance.png)

Light, Soft Dark or System, and eight colour palettes behind one collapsed row so the panel stays short. All of it is saved per device. The About tab holds the version and the links.

![Settings, About in Soft Dark: the round Feed icon, the name and version, the one line, round buttons for X, GitHub and akakika.com, and Made by Kika](docs/screenshots/05-about.png)

## Publish a report

<!-- SF Symbol: paperplane -->
```
POST http://127.0.0.1:4318/api/publish
Authorization: Bearer <agent key>

{ "run_id": "morning-brief-2026-09-12",
  "routine": "Morning brief",
  "title":   "Morning brief, 12 Sep",
  "markdown": "# Morning brief\n\n- ..." }

→ { "id": "5728d8e6-…", "duplicate": false, "url": "http://127.0.0.1:4318/?report=5728d8e6-…" }
```

The same call is the MCP tool `publish_report` at `/api/mcp` over Streamable HTTP. Required: `run_id`, `routine`, `title`, `markdown`. Optional: `published_at` (ISO with timezone), `notify` (short text for the phone notification, up to 240 characters; without it the notification shows the routine name) and up to five `attachments` as `{ name, type, base64 }`, 2 MB each, 5 MB total, 8 MB per request.

Retrying the same payload returns the same report. A different body under the same `run_id` is a `409`. Retry on network errors, `429` and `5xx`, at most three times with backoff. Stop on `401`, `403`, `409`. Every attempt is one line in `logs/server.log`.

Connector forms without a header field can carry the key in the URL: `/api/mcp/<key>` or `/api/publish/<key>`. The full contract agents are handed is [public/downloads/LOCAL-PUBLISHING.md](public/downloads/LOCAL-PUBLISHING.md), also available from Settings as Copy or Download.

On the Mac, `scripts/publish-keychain.py SOURCE payload.json` reads `{ "url", "agent_key" }` from a Keychain item (service `com.feed.agent-keys` by default, or the name in `FEED_KEYCHAIN_SERVICE` or the file `keychain-service` in the data folder) and publishes without the key ever touching the command line.

## Let an agent read

<!-- SF Symbol: book -->
Off by default: every key publishes and nothing else. To let an agent open a report you point it at, or check what you saved, add its source to `config.json` on the Mac and restart Feed:

```json
"readSources": ["claude"]
```

Keys of that source then get two more MCP tools at `/api/mcp`:

| Tool | What it returns |
|---|---|
| `get_report(id)` | One report by its Feed ID (Copy Feed ID in the report's menu): the full Markdown, the attachment names and your comments on it, marked `owner_notes`. |
| `list_saved()` | What you saved, newest saved first, up to 200, without the report text or comments. |

- Loopback only. The tools answer only a direct call to `127.0.0.1` or `localhost`. Through a tunnel, a public publish origin or the private network, the same key can only publish, and the tools do not exist there.
- Read-only. Reading does not mark a report read. Agents cannot change Saved, and they never see your favourites or read state.
- Report text and comments are data. Reports are written by other agents, so the tool descriptions and every answer tell the reader not to follow anything written inside a report or a comment.
- Every read and refused read is one line in `logs/server.log`.

## Reach it

<!-- SF Symbol: iphone.and.arrow.forward -->
| Who | How |
|---|---|
| The Mac | `http://127.0.0.1:4318` |
| Phone or another device | A private network proxy (Tailscale Serve works well) from an HTTPS origin to the loopback port. Put that origin in `config.json` as `origin`. |
| Cloud agents | Optional. A tunnel to the Mac whose public origin goes in `config.json` as `publishOrigins`; on that host Feed answers `/api/mcp` and `/api/publish` only, everything else is `404`. |

Unlock with the Feed password. Five wrong tries lock the form for thirty seconds.

## Install

<!-- SF Symbol: hammer -->
```sh
git clone https://github.com/aka-kika/feed-mac.git && cd feed-mac
npm install
npm run build                          # dist/ for the browser, server/routes.mjs for Node
python3 scripts/setup.py               # origin, port, password (Python 3.10+ for scrypt)
python3 scripts/install-launchagent.py # starts Feed at login as com.feed.web
curl -sS http://127.0.0.1:4318/health
```

| What | Where |
|---|---|
| Data (0700) | `~/Library/Application Support/Feed/`: SQLite, attachments, `config.json` (0600), `logs/` |
| LaunchAgent | `~/Library/LaunchAgents/com.feed.web.plist` (label from `FEED_LAUNCHAGENT_LABEL`) |
| Data folder override | `FEED_DATA_DIR` |
| Upgrade backups | `backups/` in the data folder: a checked copy of the database, made before an upgrade changes it. Delete old ones when you like. |

Restart after a config change: `launchctl kickstart -k "gui/$(id -u)/com.feed.web"`. Notifications through ntfy are optional: add `"ntfy": { "url", "topic", "token", "priority" }` to `config.json`; a push never blocks a publish. Only Feed-tab reports send one; Reports arrive quietly.

## Docs

<!-- SF Symbol: doc.text -->
- [VALIDATION.md](VALIDATION.md): what `npm test` proves.
- [public/downloads/LOCAL-PUBLISHING.md](public/downloads/LOCAL-PUBLISHING.md): the contract handed to agents.
- [public/agents/SOURCES.md](public/agents/SOURCES.md): where each source icon comes from.
- `scripts/backup.mjs <dir>` and `scripts/import.mjs <export.json>`: backup and portable restore. Stop Feed first so the database and attachments are one point in time.

## Release

<!-- SF Symbol: shippingbox -->
Bump `version` in `package.json`, `npm run build`, `npm test`, refresh `SHA256SUMS` (`git ls-files | grep -v SHA256SUMS | xargs shasum -a 256 > SHA256SUMS`), commit, tag. The built `dist/` and `server/routes.mjs` are committed on purpose so an install never needs a build step. A pre-commit hook (`.githooks/`, enable with `git config core.hooksPath .githooks`) strips generator metadata from every staged image and stamps the author credit; third-party agent marks are left alone.

## Contributing

One maintainer, replies when she can. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

Made by **Kika** ([aka-kika](https://github.com/aka-kika), [akakika.com](https://akakika.com)).
