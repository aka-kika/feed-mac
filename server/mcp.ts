import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { body, failure, HttpError, publish, publisher, reportUrl } from '@/lib/server';
import { publishShape } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const key = await publisher(request), parsedBody = await body(request);
    const server = new McpServer({ name: 'feed-publisher', version: '1.0.0' });
    server.registerTool('publish_report', {
      description: 'Publish a Markdown report to the personal Feed. The credential determines the source. Reuse the same run_id and identical payload for delivery retries.',
      inputSchema: publishShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async input => {
      try { const result = await publish(key, input); return { content: [{ type: 'text', text: JSON.stringify({ ...result, url: reportUrl(request, result.id) }) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof HttpError ? error.message : 'Report could not be saved. Retry with the same run ID and payload.' }] }; }
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try { const response = await transport.handleRequest(request, { parsedBody }); const bytes = await response.arrayBuffer(); return new Response(bytes.byteLength ? bytes : null, { status: response.status, headers: { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store' } }); }
    finally { await server.close(); }
  } catch (error) { return failure(error); }
}
export function GET() { return new Response(null, { status: 405, headers: { Allow: 'POST' } }); }
export const DELETE = GET;
