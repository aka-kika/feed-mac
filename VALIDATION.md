# Validation

Smoke test: `npm test` (`node tests/smoke.mjs`). It starts Feed on a random loopback port with a throwaway data folder and never touches a real install.

It checks:

- HTTP login, unauthorized report, key and attachment denial, a forged identity header is still 401
- Cross-origin mutation rejection; on a public publish origin anything but the two publish paths is 404; an unknown host is 403
- A key can be prepared for every source in the list; an unknown source is a 400
- Connection instructions never carry a third-party token, name the public publish origin with the path-token form, and state the rate limit
- Source-scoped publishing with Markdown and a binary attachment
- Identical retry returns the same id; a changed payload returns 409
- Comments, favourites, read and archive
- Saved: save and unsave, a saved report staying separate from its favourite star, newest saved first across pages, saving twice keeping the first time, archiving leaving a report in Saved, a key unable to change it
- MCP `initialize` and `publish_report` over Streamable HTTP
- Read tools: off by default; `get_report` and `list_saved` only for a source on `readSources`; no favourites, read state or comments in the answer; reading changes nothing; every read and refusal logged; a revoked key stops reading
- Read tools refused, whatever the key, on the public publish origin (with the header and the path-token form), on the private-network origin, and on a loopback Host that carries a proxy header (`Cf-Connecting-Ip`, `Cf-Ray`, `X-Forwarded-For`, `Forwarded`, `Tailscale-Funnel-Request`); the public origin still publishes
- Agent icon files are served from `dist/agents/`
- Restart preserves body, comments, attachments and state
- An old database upgrades with every row kept, after a backup taken from before the change; a second start adds no backup; a new database needs none
- Portable import keeps content, comments, state, the saved time and attachment bytes, and rejects a bad checksum

Left to the operator of a real install: sleep and reboot behaviour of the LaunchAgent, that every publisher on the Feed Mac uses the loopback url, and, after an install with a tunnel, that the public origin lists only `publish_report` for a key that can read on loopback.
