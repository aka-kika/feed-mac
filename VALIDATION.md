# Validation

Smoke test: `npm test` builds first, so it tests the current source and not an old bundle, then runs `node tests/smoke.mjs`. It starts Feed on a random loopback port with a throwaway data folder and never touches a real install.

It checks:

- HTTP login, unauthorized report, key and attachment denial, a forged identity header is still 401
- Cross-origin mutation rejection; on a public publish origin anything but the two publish paths is 404; an unknown host is 403
- A key can be prepared for every source in `lib/types.ts`; an unknown source is a 400
- Connection instructions never carry a third-party token, name the public publish origin with the path-token form, and state the rate limit
- Source-scoped publishing with Markdown and a binary attachment
- Identical retry returns the same id; a changed payload returns 409
- Comments, favourites, read and archive
- Saved: save and unsave, a saved report staying separate from its favourite star, newest saved first across pages, saving twice keeping the first time, archiving leaving a report in Saved, a key unable to change it
- Ticks: an owner tick stays after a restart, ticking twice keeps it, unticking removes it, and the report's text and retry stay the same; a `- [ ]` in a code block is no box, a box the report wrote as `- [x]` cannot be ticked, an unknown box or report is refused, a tick whose label names another box is refused; a box's text comes out one level out from a quote or a nested list, and lines after the list stay as written; a key, a request with no session and a cross-origin request cannot tick; the public origin has no tick path
- MCP `initialize` and `publish_report` over Streamable HTTP
- Read tools: off by default, with no read door at all; `get_report` and `list_saved` only for a source on `readSources`; no favourites or read state in the answer; `get_report` carries the owner's comments as `owner_notes` and ticks as `ticks`, each box whole up to the next box or heading, fenced blocks included, and `list_saved` carries neither; reading changes nothing; every read and refusal logged; a revoked key stops reading
- Comments and ticks stay out for a key off the allow list and at every other door
- Read tools exist only on the read door, a second loopback listener that opens only when a source may read. Refused, whatever the key, on the main port with a loopback Host, on the public publish origin (with the header and the path-token form), on the private-network origin, and on the read door when a request carries a proxy header (`Cf-Connecting-Ip`, `Cf-Ray`, `X-Forwarded-For`, `Forwarded`, `Tailscale-Funnel-Request`); the public origin still publishes
- The read door answers only the MCP path: pages, sign-in, the owner API, the health check and plain publishing are 404, an unknown Host and any browser request are 403. Links it hands out open the app, and the instructions carry its address also when Settings is opened over the private network
- Agent icon files are served from `dist/agents/`
- Every icon in the manifest is served, and the apple touch icon has no transparency
- Restart preserves body, comments, attachments and state
- An old database upgrades with every row kept, after a backup taken from before the change, also one from the release before ticks; a second start adds no backup; a new database needs none
- Export and import: content, comments, state, the saved time, ticks and attachment bytes come back in an empty install; over a report still there, import fills in what it lost and takes nothing away, a second run changes nothing, other content under the same ID stops it, a file missing after a crash comes back on the next run, and a bad checksum is rejected

Left to the operator of a real install: sleep and reboot behaviour of the LaunchAgent, that every publisher on the Feed Mac uses the loopback url, and, after an install with a tunnel, that the public origin lists only `publish_report` for a key that can read, and that no tunnel or proxy points at the read port. The tick boxes, Back and the refresh are drawn in a browser, which the smoke test does not start.
