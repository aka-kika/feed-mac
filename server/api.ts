import { loopbackOrigin, publicOrigin, publishOrigins, readPort, readSources } from './storage.mjs';
import { connectionInstructions } from '@/lib/connection-instructions';
import { body, db, bucket, failure, hash, HttpError, json, ownedReport, owner, publish, publisher, reportUrl, sameOrigin } from '@/lib/server';
import { publishShape, sourceSchema } from '@/lib/validation';
import { KIND_SQL } from '@/lib/kinds';
import { boxLabel, reportBoxes } from '@/lib/ticks';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  try {
    const { path } = await context.params, [route, id] = path;
    const method = request.method, url = new URL(request.url);
    if (route === 'publish' && method === 'POST') {
      const result = await publish(await publisher(request), await body(request));
      return json({ ...result, url: reportUrl(request, result.id) }, result.duplicate ? 200 : 201);
    }
    const user = await owner();
    if (method !== 'GET') sameOrigin(request);
    if (route === 'reports' && method === 'GET' && !id) {
      const where = ['r.owner = ?', 'r.sample = 0']; const args: (string | number)[] = [user];
      const source = url.searchParams.get('source'), routine = url.searchParams.get('routine'), view = url.searchParams.get('view'), q = url.searchParams.get('q')?.slice(0, 200);
      // Saved is its own shelf: a report stays there until it is removed, archived or not. Newest saved first.
      const saved = view === 'saved', order = saved ? 'saved_at' : 'published_at';
      where.push(saved ? 'r.saved_at IS NOT NULL' : view === 'archive' ? 'r.archived = 1' : 'r.archived = 0');
      if (source) { where.push('r.source = ?'); args.push(source); }
      if (routine) { where.push('r.routine = ?'); args.push(routine); }
      if (view === 'news' || view === 'reports') where.push(`${KIND_SQL} = '${view === 'news' ? 'news' : 'report'}'`);
      if (view === 'unread') where.push('r.is_read = 0');
      if (view === 'favourites') where.push('r.favourite = 1');
      if (view === 'commented') where.push('EXISTS (SELECT 1 FROM comments c WHERE c.report_id = r.id AND c.owner = r.owner)');
      if (q) { const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`; where.push("(r.title LIKE ? ESCAPE '\\' OR r.markdown LIKE ? ESCAPE '\\' OR r.routine LIKE ? ESCAPE '\\')"); args.push(search, search, search); }
      const cursor = url.searchParams.get('cursor');
      if (cursor) { try { const [date, key] = JSON.parse(atob(cursor)); if (typeof date !== 'string' || typeof key !== 'string') throw Error(); where.push(`(r.${order} < ? OR (r.${order} = ? AND r.id < ?))`); args.push(date, date, key); } catch { throw new HttpError(400, 'Invalid page cursor.'); } }
      const results = await db().prepare(`SELECT r.id, r.source, r.routine, r.title, substr(r.markdown, 1, 320) AS markdown, r.published_at, r.received_at, r.favourite, r.saved_at, (r.saved_at IS NOT NULL) AS saved, r.archived, r.is_read, r.sample, ${KIND_SQL} AS kind, (SELECT count(*) FROM comments c WHERE c.report_id = r.id) AS comment_count FROM reports r WHERE ${where.join(' AND ')} ORDER BY r.${order} DESC, r.id DESC LIMIT 41`).bind(...args).all();
      const more = results.results.length > 40, items = results.results.slice(0, 40), last = items.at(-1);
      const routines = await db().prepare(`SELECT DISTINCT r.source, r.routine, ${KIND_SQL} AS kind FROM reports r WHERE r.owner = ? AND r.sample = 0 ORDER BY r.routine`).bind(user).all();
      const counts = await db().prepare(`SELECT count(*) AS total, coalesce(sum(CASE WHEN r.is_read = 0 AND r.archived = 0 THEN 1 ELSE 0 END),0) AS unread, coalesce(sum(CASE WHEN r.is_read = 0 AND r.archived = 0 AND ${KIND_SQL} = 'news' THEN 1 ELSE 0 END),0) AS unread_news, coalesce(sum(CASE WHEN r.is_read = 0 AND r.archived = 0 AND ${KIND_SQL} = 'report' THEN 1 ELSE 0 END),0) AS unread_reports FROM reports r WHERE r.owner = ? AND r.sample = 0`).bind(user).first();
      return json({ reports: items, routines: routines.results, counts, cursor: more && last ? btoa(JSON.stringify([last[order], last.id])) : null });
    }
    if (route === 'reports' && id && path[2] === 'ticks' && method === 'GET') {
      if (!await db().prepare('SELECT 1 FROM reports WHERE id = ? AND owner = ?').bind(id, user).first()) throw new HttpError(404, 'Report not found.');
      const ticks = await db().prepare('SELECT box FROM report_ticks WHERE report_id = ? ORDER BY box').bind(id).all<{ box: number }>();
      return json({ ticks: ticks.results.map(t => t.box) });
    }
    if (route === 'reports' && id && method === 'GET') {
      const report = await ownedReport(id, user);
      const { kind } = (await db().prepare(`SELECT ${KIND_SQL} AS kind FROM reports r WHERE r.id = ?`).bind(id).first<{ kind: string }>())!;
      if (report.sample) throw new HttpError(404, 'Report not found.');
      if (url.searchParams.get('download') === 'markdown') return new Response(String(report.markdown), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="report.md"; filename*=UTF-8''${encodeURIComponent(String(report.title).replace(/[\x00-\x1f/\\]/g, '-').slice(0, 100) + '.md')}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      const comments = await db().prepare('SELECT id, body, created_at FROM comments WHERE report_id = ? AND owner = ? ORDER BY created_at, id').bind(id, user).all();
      const attachments = await db().prepare('SELECT id, name, type, size FROM attachments WHERE report_id = ?').bind(id).all();
      const ticks = await db().prepare('SELECT box FROM report_ticks WHERE report_id = ? ORDER BY box').bind(id).all<{ box: number }>();
      const { owner: _owner, payload_hash: _hash, ...safe } = report;
      return json({ report: { ...safe, saved: report.saved_at ? 1 : 0, kind, attachments: attachments.results, comment_count: comments.results.length, ticks: ticks.results.map(t => t.box) }, comments: comments.results });
    }
    if (route === 'reports' && id && method === 'PATCH') {
      await ownedReport(id, user);
      const data = z.object({ archived: z.boolean().optional(), favourite: z.boolean().optional(), is_read: z.boolean().optional(), saved: z.boolean().optional() }).strict().parse(await body(request, 2000));
      const fields = Object.entries(data); if (!fields.length) throw new HttpError(400, 'Choose a change to save.');
      // Saving twice keeps the first saved time, so a retry does not reorder the shelf.
      await db().prepare(`UPDATE reports SET ${fields.map(([key, v]) => key === 'saved' ? v ? 'saved_at = coalesce(saved_at, ?)' : 'saved_at = ?' : `${key} = ?`).join(', ')} WHERE id = ? AND owner = ?`).bind(...fields.map(([key, v]) => key === 'saved' ? v ? new Date().toISOString() : null : v ? 1 : 0), id, user).run();
      return json({ saved: true });
    }
    if (route === 'routine-kinds' && method === 'POST') {
      const data = z.object({ source: z.string().min(1).max(80), routine: publishShape.routine, kind: z.enum(['news', 'report']) }).strict().parse(await body(request, 2000));
      await db().prepare('INSERT INTO routine_kinds (owner, source, routine, kind) VALUES (?, ?, ?, ?) ON CONFLICT(owner, source, routine) DO UPDATE SET kind = excluded.kind').bind(user, data.source, data.routine, data.kind).run();
      return json({ saved: true });
    }
    // Ticks live beside the report, never in its text. Ticking twice keeps the first time.
    if (route === 'ticks' && method === 'POST') {
      const data = z.object({ report_id: z.string().uuid(), box: z.number().int().positive(), ticked: z.boolean(), label: z.string().max(200).optional() }).strict().parse(await body(request, 2000));
      const report = await ownedReport(data.report_id, user);
      const found = reportBoxes(String(report.markdown)).find(b => b.box === data.box && !b.written);
      if (!found) throw new HttpError(400, 'That box cannot be ticked.');
      if (data.label !== undefined && data.label !== boxLabel(found)) throw new HttpError(409, 'This page is out of date. Reload it and tick again.');
      if (data.ticked) await db().prepare('INSERT INTO report_ticks (report_id, box, ticked_at) VALUES (?, ?, ?) ON CONFLICT(report_id, box) DO NOTHING').bind(data.report_id, data.box, new Date().toISOString()).run();
      else await db().prepare('DELETE FROM report_ticks WHERE report_id = ? AND box = ?').bind(data.report_id, data.box).run();
      return json({ saved: true });
    }
    if (route === 'comments' && method === 'POST') {
      const data = z.object({ id: z.string().uuid(), report_id: z.string().uuid(), body: z.string().trim().min(1).max(10000) }).strict().parse(await body(request, 50000));
      await ownedReport(data.report_id, user);
      await db().prepare('INSERT INTO comments (id, report_id, owner, body, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(data.id, data.report_id, user, data.body, new Date().toISOString()).run();
      const comment = await db().prepare('SELECT id, body, created_at FROM comments WHERE id = ? AND report_id = ? AND owner = ?').bind(data.id, data.report_id, user).first();
      if (!comment || comment.body !== data.body) throw new HttpError(409, 'This comment ID has already been used.');
      return json({ comment }, 201);
    }
    if (route === 'comments' && id && method === 'DELETE') { await db().prepare('DELETE FROM comments WHERE id = ? AND owner = ?').bind(id, user).run(); return json({ deleted: true }); }
    if (route === 'keys' && method === 'GET') { const result = await db().prepare('SELECT id, source, label, created_at, last_used_at FROM agent_keys WHERE owner = ? ORDER BY created_at DESC').bind(user).all(); return json({ keys: result.results, delivery_ready: true, read_sources: readSources }); }
    if (route === 'keys' && method === 'POST') {

      const data = z.object({ source: sourceSchema, label: z.string().trim().min(1).max(80) }).strict().parse(await body(request, 2000));
      const bytes = crypto.getRandomValues(new Uint8Array(32)), token = 'feed_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), id = crypto.randomUUID(), created_at = new Date().toISOString();
      await db().prepare('INSERT INTO agent_keys (id, owner, source, label, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user, data.source, data.label, await hash(token), created_at).run();
      return json({ token, instructions: connectionInstructions(url.origin, data.source, token, id, { tailnet: publicOrigin, cloud: publishOrigins, loopback: loopbackOrigin, reader: readSources.includes(data.source) ? `http://127.0.0.1:${readPort}` : null }), key: { id, source: data.source, label: data.label, created_at, last_used_at: null } }, 201);
    }
    if (route === 'keys' && id && method === 'DELETE') { await db().prepare('DELETE FROM agent_keys WHERE id = ? AND owner = ?').bind(id, user).run(); return json({ revoked: true }); }
    if (route === 'attachments' && id && method === 'GET') {
      const file = await db().prepare('SELECT a.* FROM attachments a JOIN reports r ON r.id = a.report_id WHERE a.id = ? AND r.owner = ?').bind(id, user).first<{ object_key: string; name: string }>();
      if (!file) throw new HttpError(404, 'Attachment not found.');
      const object = await bucket().get(file.object_key); if (!object) throw new HttpError(404, 'Attachment is unavailable.');
      return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
    }
    if (route === 'demo' && id === 'cleanup' && method === 'POST') {
      await db().prepare("DELETE FROM reports WHERE owner = ? AND sample = 1 AND run_id IN ('sample-welcome-v1', 'sample-rich-markdown-v2')").bind(user).run();
      return json({ removed: true });
    }
    throw new HttpError(404, 'Not found.');
  } catch (error) { return failure(error); }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
