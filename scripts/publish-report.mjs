#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export async function publish({ origin, agentKey, data, fetcher = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const base = new URL(origin);
  if (!(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname))) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('FEED_URL must be HTTPS or loopback HTTP.');
  if (!agentKey) throw new Error('A publishing key is required.');
  if (!data || ['run_id', 'routine', 'title', 'markdown'].some(k => typeof data[k] !== 'string' || !data[k].trim()) || 'source' in data) throw new Error('Provide run_id, routine, title and markdown; omit source.');
  const body = JSON.stringify(data);
  if (Buffer.byteLength(body) > 8 * 1024 * 1024) throw new Error('Request exceeds 8 MB.');
  const endpoint = new URL('/api/publish', base);
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try { response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentKey}` }, body }); }
    catch { if (attempt === 3) throw new Error('Delivery unconfirmed after four attempts. Retain the payload and run ID.'); await sleep(1000 * 2 ** attempt); continue; }
    if (response.status === 401 || response.status === 403) throw new Error('Connection rejected. Ask the user to check the publishing key.');
    if (response.status === 409) throw new Error('Run ID conflict: existing report has different content. Stop and retain the run ID.');
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 3) throw new Error('Delivery unconfirmed after four attempts. Retain the payload and run ID.');
      const retry = response.headers.get('retry-after');
      const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      await sleep(Math.min(30000, Math.max(1000 * 2 ** attempt, Number.isFinite(delay) ? delay : 0))); continue;
    }
    if (![200, 201].includes(response.status)) throw new Error(`Delivery rejected (HTTP ${response.status}). Check the request before retrying.`);
    let result; try { result = await response.json(); } catch { throw new Error('No valid receipt. Delivery is unconfirmed; retain the run ID.'); }
    if (typeof result.id !== 'string' || !result.id) throw new Error('No report ID returned. Delivery is unconfirmed.');
    let url; try { url = new URL(result.url); } catch { throw new Error('Report ID received but report URL missing.'); }
    if (url.origin !== base.origin) throw new Error('Report ID received but returned URL is not the Feed origin.');
    return { id: result.id, duplicate: !!result.duplicate, url: url.href };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { FEED_URL: origin, FEED_AGENT_KEY: agentKey } = process.env;
    if (!origin || !agentKey || !process.argv[2]) throw new Error('Configure FEED_URL and FEED_AGENT_KEY, then pass report.json.');
    let data; try { data = JSON.parse(await readFile(process.argv[2], 'utf8')); } catch { throw new Error('Cannot read a valid report JSON file.'); }
    console.log(JSON.stringify(await publish({ origin, agentKey, data }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
