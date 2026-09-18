import { env, auth, notify, publicOrigin } from '../server/storage.mjs';

import { publishSchema, type PublishInput } from './validation';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function db() { if (!env.DB) throw new HttpError(503, 'Storage is temporarily unavailable. Please try again.'); return env.DB; }
export function bucket() { if (!env.BUCKET) throw new HttpError(503, 'Attachment storage is unavailable.'); return env.BUCKET; }
export async function owner() { if (!auth.getStore()) throw new HttpError(401, 'Please unlock Feed.'); return 'local-owner'; }
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin requests are not allowed.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
}
export async function body(request: Request, limit = 8_000_000) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'This request is too large.');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new HttpError(413, 'This request is too large.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Send valid JSON.'); }
}
export async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
export type Publisher = { id: string; owner: string; source: string };
const PUBLISH_LIMIT = 30, PUBLISH_WINDOW = 60_000, publishHits = new Map<string, number[]>();
function throttle(key: Publisher, runId: unknown) {
  const now = Date.now(), hits = (publishHits.get(key.id) ?? []).filter(t => now - t < PUBLISH_WINDOW);
  if (hits.length >= PUBLISH_LIMIT) { publishHits.set(key.id, hits); logPublish(key, runId, 'throttled'); throw new HttpError(429, 'Too many publishes from this key. Try again in a minute.'); }
  hits.push(now); publishHits.set(key.id, hits);
}
export function logPublish(key: Publisher, runId: unknown, outcome: string) { console.log(`${new Date().toISOString()} publish key=${key.id} source=${key.source} run_id=${typeof runId === 'string' ? runId.slice(0, 160) : '-'} outcome=${outcome}`); }
export async function publisher(request: Request): Promise<Publisher> {
  sameOrigin(request);
  const token = request.headers.get('authorization')?.match(/^Bearer (feed_[a-f0-9]{64})$/)?.[1];
  if (!token) throw new HttpError(401, 'A valid agent publishing key is required.');
  const key = await db().prepare('SELECT id, owner, source FROM agent_keys WHERE hash = ?').bind(await hash(token)).first<Publisher>();
  if (!key) throw new HttpError(401, 'This publishing key is invalid or has been revoked.');
  return key;
}
export async function ownedReport(id: string, user: string) {
  const report = await db().prepare('SELECT * FROM reports WHERE id = ? AND owner = ?').bind(id, user).first();
  if (!report) throw new HttpError(404, 'Report not found.');
  return report;
}
function decodeFile(base64: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new HttpError(400, 'An attachment is not valid base64.');
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (bytes.length > 2_000_000) throw new HttpError(413, 'Each attachment must be 2 MB or smaller.');
  return bytes;
}
export async function publish(key: Publisher, raw: PublishInput, sample = false) {
  if (!sample) throttle(key, (raw as { run_id?: unknown })?.run_id);
  const data = publishSchema.parse(raw);
  const payloadHash = await hash(JSON.stringify(data));
  const existing = await db().prepare('SELECT id, payload_hash FROM reports WHERE owner = ? AND source = ? AND routine = ? AND run_id = ?').bind(key.owner, key.source, data.routine, data.run_id).first<{ id: string; payload_hash: string }>();
  if (existing) { if (existing.payload_hash !== payloadHash) { logPublish(key, data.run_id, 'conflict'); throw new HttpError(409, 'This run ID already has different content. Use a new run ID.'); } logPublish(key, data.run_id, 'duplicate'); return { id: existing.id, duplicate: true }; }
  const files = data.attachments.map(f => ({ ...f, bytes: decodeFile(f.base64), id: crypto.randomUUID() }));
  if (files.reduce((n, f) => n + f.bytes.length, 0) > 5_000_000) throw new HttpError(413, 'Attachments must total 5 MB or less.');
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const uploaded: string[] = [];
  try {
    for (const file of files) { const path = `${id}/${file.id}`; await bucket().put(path, file.bytes, { httpMetadata: { contentType: 'application/octet-stream' } }); uploaded.push(path); }
    const statements = [db().prepare('INSERT INTO reports (id, owner, source, run_id, routine, title, markdown, payload_hash, published_at, received_at, sample) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, key.owner, key.source, data.run_id, data.routine, data.title, data.markdown, payloadHash, data.published_at ? new Date(data.published_at).toISOString() : now, now, sample ? 1 : 0)];
    for (const file of files) statements.push(db().prepare('INSERT INTO attachments (id, report_id, name, type, size, object_key) VALUES (?, ?, ?, ?, ?, ?)').bind(file.id, id, file.name, file.type, file.bytes.length, `${id}/${file.id}`));
    if (!sample) statements.push(db().prepare('UPDATE agent_keys SET last_used_at = ? WHERE id = ?').bind(now, key.id));
    await db().batch(statements);
    if (!sample) { logPublish(key, data.run_id, `created id=${id}`); notify({ title: `${key.source} · ${data.title}`, message: data.routine, click: `${publicOrigin ?? ''}/?report=${id}` }); }
    return { id, duplicate: false };
  } catch (error) {
    for (const path of uploaded) { try { await bucket().delete(path); } catch { console.error('Attachment cleanup failed'); } }
    const concurrent = await db().prepare('SELECT id, payload_hash FROM reports WHERE owner = ? AND source = ? AND routine = ? AND run_id = ?').bind(key.owner, key.source, data.routine, data.run_id).first<{ id: string; payload_hash: string }>();
    if (concurrent) { if (concurrent.payload_hash !== payloadHash) throw new HttpError(409, 'This run ID already has different content.'); return { id: concurrent.id, duplicate: true }; }
    throw error;
  }
}
// Reports are read on the tailnet origin; a publish that came in over a public HTTPS origin (Funnel) gets that origin back, loopback stays loopback.
export function reportUrl(request: Request, id: string) { const origin = new URL(request.url).origin; return `${origin.startsWith('https:') && publicOrigin ? publicOrigin : origin}/?report=${id}`; }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); }
export function failure(error: unknown) {
  if (error instanceof HttpError) { const response = json({ error: error.message }, error.status); if (error.status === 429) response.headers.set('Retry-After', '60'); return response; }
  if (error && typeof error === 'object' && 'issues' in error) return json({ error: 'Some fields are invalid. Check the report title, routine, run ID and content.' }, 400);
  console.error('Feed request failed', error instanceof Error ? error.message : 'Unknown storage error');
  return json({ error: 'Could not complete this request. Please try again.' }, 503);
}
