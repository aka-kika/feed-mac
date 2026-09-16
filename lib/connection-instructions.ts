import { sourceName } from './types';

export type Origins = { tailnet?: string | null; cloud?: string[] };
export function connectionInstructions(origin: string, source: string, agentKey: string, keyId: string, origins: Origins = {}) {
  const name = sourceName(source);
  const tailnet = origins.tailnet && origins.tailnet !== origin ? origins.tailnet : null;
  const cloud = (origins.cloud ?? []).filter(o => o !== origin);
  const reach = [`Feed: ${origin} (this device)`, ...(tailnet ? [`From another device on the private network: ${tailnet}`] : []), ...cloud.map(o => `From the internet, publish paths only (/api/mcp and /api/publish): ${o}`)];
  const pathToken = cloud[0] ?? origin;
  const headers = { Authorization: `Bearer ${agentKey}` };
  const check = { run_id: `connection-check-${keyId}`, routine: 'Connection check', title: `${name} is connected`, markdown: `This is a connection check from ${name}. Future routine reports will arrive in this feed.` };
  return `Connect to my private Feed as ${name}.

${reach.join('\n')}
Use the address your runtime can reach; the key is the same on all of them. Your publishing key is scoped to ${name}. It can submit reports, but cannot read my reports, favourites or comments.

1. Store the credentials below in your secret storage or protected environment configuration. Do not put them in reports, logs, source control or public messages. Keep the complete instructions private.

2. Prefer remote MCP if your environment supports Streamable HTTP with custom headers:
Endpoint: ${origin}/api/mcp
Tool: publish_report
Headers:
${JSON.stringify(headers, null, 2)}

For clients that use an mcpServers configuration, the connection is:
${JSON.stringify({ mcpServers: { feed: { type: 'http', url: `${origin}/api/mcp`, headers } } }, null, 2)}
Publish from the routine runtime that holds the COMPLETE report. Never substitute a status receipt or conversation ID. Keep credentials in the Mac Keychain or your runtime secret store.

Adapt only the configuration shape to your client's requirements. Keep the URL and the Authorization header unchanged.

If your connector form has no header field, put the key in the server URL instead: ${pathToken}/api/mcp/${agentKey} (the last path segment becomes the Authorization header; the same works for ${pathToken}/api/publish/${agentKey}). Treat that URL as a secret.

3. If you use an HTTP tool instead, POST JSON to ${origin}/api/publish with that Authorization header and Content-Type: application/json. The JSON body is the same as publish_report's arguments. Do not use browser clicks to submit reports.

4. Send exactly one connection-check report with these arguments:
${JSON.stringify(check, null, 2)}
Only confirm connection after the server returns a report ID (HTTP 200/201, or a successful MCP result). Return the report URL to me, without repeating credentials. If your environment cannot make authenticated requests, tell me what capability is missing; do not claim success.

5. For the routines I ask you to connect, publish their completed output with:
- run_id: a stable unique ID for that routine run; reuse it on retries.
- routine: the routine's consistent human-readable name.
- title: a concise report title.
- markdown: the complete report, including headings, links, lists, tables and fenced code where useful.
- published_at: optional ISO timestamp with timezone.
- attachments: optional array of { name, type, base64 }; up to 5 files, 2 MB per file and 5 MB total. Entire request limit: 8 MB.
Do not pass a source field; the key already identifies you. Keep failed or partial results clearly labelled. Never include credentials in Markdown or attachments.

Feed accepts 30 publishes per key per minute; the next one gets HTTP 429 with Retry-After: 60. Retry network errors and HTTP 429/5xx with bounded backoff, retaining exactly the same payload and run_id. An identical retry returns the existing report. HTTP 409 means that run ID already has different content; stop and report the conflict. For 401/403, stop and ask me to check the connection credentials. Do not change my routine schedules unless I ask.
`;
}

