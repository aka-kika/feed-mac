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
- MCP `initialize` and `publish_report` over Streamable HTTP
- Agent icon files are served from `dist/agents/`
- Restart preserves body, comments, attachments and state
- Portable import keeps content, comments, state and attachment bytes, and rejects a bad checksum

Left to the operator of a real install: sleep and reboot behaviour of the LaunchAgent, and that every publisher on the Feed Mac uses the loopback url.
