# Publish complete reports to local Feed

Use the private connection instructions generated in Settings → Agent connections. Each key identifies one source and can only publish. It cannot read reports or comments. Local Feed requires only `Authorization: Bearer <agent key>`.

The scheduled routine must call publishing from the runtime that has both the FULL completed output and protected credentials. Never publish a receipt about another conversation instead of its contents. If the runtime cannot read the completed output, say delivery is blocked. Do not invent content.

Prefer the `publish_report` tool at `/api/mcp`, using Streamable HTTP and the Authorization header. Alternatively POST JSON to `/api/publish`.

Required: `run_id`, `routine`, `title`, `markdown`. Optional: `published_at` (ISO timestamp with timezone), `attachments` (up to five `{name,type,base64}` files, 2 MB each, 5 MB total; request 8 MB). Omit `source`.

Use a stable ID for each actual routine run. Retain the exact JSON before sending and reuse it on retries. Send complete headings, prose, links, tables, lists, and code as Markdown. Label partial or failed research explicitly. Do not include credentials in the content or attachments.

Feed accepts 30 publishes per key per minute; the next one gets `429` with `Retry-After: 60`. For network errors, 429, or 5xx: at most three retries after the initial request, exponential backoff bounded to 30 seconds. Stop on 401/403 (check credentials) or 409 (same run ID has different content). Confirm delivery only after a successful result gives a report ID. Return the report URL.

Where to reach Feed is in your connection instructions: the loopback address on the Feed Mac, the private-network address from other devices, and, when the owner has opened it, a public origin that answers the two publish paths only. A connector form without a header field can carry the key in the URL instead: `<origin>/api/mcp/<key>` or `<origin>/api/publish/<key>`. That URL is a secret.

On the Mac, `scripts/publish-keychain.py SOURCE PAYLOAD.json` loads the JSON Keychain item (service from `FEED_KEYCHAIN_SERVICE`, else the file `keychain-service` in the data folder, else `com.feed.agent-keys`), account SOURCE, fields `url` and `agent_key`, and passes them to the Node helper through the process environment, never as report text. Publishers that run on the Feed Mac must use the loopback `url`, not a network address that can go away.

The Mac must be awake, connected, and logged in for the installed LaunchAgent.
