import { getStore } from '@netlify/blobs';
import { createHash, randomBytes } from 'node:crypto';

// Cloud sync for LexiGo: one snapshot of a teacher's LexiGo data per sync
// code. The code is the only credential (120 random bits), so it is never
// stored; blobs are keyed by its SHA-256 hash.
const STORE_NAME = 'lexigo-cloud-sync-v1';
const MAX_BYTES = 5 * 1024 * 1024;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function cleanCode(value) {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 24 && [...code].every(ch => ALPHABET.includes(ch)) ? code : '';
}

function newCode() {
  return [...randomBytes(24)].map(b => ALPHABET[b % 32]).join('');
}

function keysFor(code) {
  const id = createHash('sha256').update('lexigo-cloud:' + code).digest('hex');
  return { meta: 'sync/' + id + '/meta.json', data: 'sync/' + id + '/data.txt' };
}

export default async request => {
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'Use POST.' });
  let body;
  try { body = await request.json(); }
  catch { return reply(400, { ok: false, error: 'Invalid request.' }); }

  let store;
  try { store = getStore(STORE_NAME); }
  catch { return reply(503, { ok: false, error: 'Cloud storage is unavailable right now.' }); }

  try {
    if (body.action === 'create') {
      const code = newCode();
      const k = keysFor(code);
      await store.set(k.meta, JSON.stringify({ rev: 0, updatedAt: 0, createdAt: Date.now(), size: 0 }));
      return reply(200, { ok: true, code, rev: 0 });
    }

    const code = cleanCode(body.code);
    if (!code) return reply(400, { ok: false, error: 'That sync code is not valid.' });
    const k = keysFor(code);
    const meta = await store.get(k.meta, { type: 'json' });
    if (!meta) return reply(404, { ok: false, error: 'That sync code was not found.' });

    if (body.action === 'meta') {
      return reply(200, { ok: true, rev: meta.rev, updatedAt: meta.updatedAt, size: meta.size || 0, device: meta.device || '' });
    }

    if (body.action === 'pull') {
      const data = meta.rev ? await store.get(k.data) : null;
      return reply(200, { ok: true, rev: meta.rev, updatedAt: meta.updatedAt, device: meta.device || '', enc: meta.enc || 'json', data: data || null });
    }

    if (body.action === 'push') {
      const data = String(body.data || '');
      if (!data) return reply(400, { ok: false, error: 'Nothing to save.' });
      if (data.length > MAX_BYTES) return reply(413, { ok: false, error: 'The data is too large for cloud sync.' });
      if (!body.force && Number(body.baseRev) !== Number(meta.rev)) {
        return reply(409, { ok: false, conflict: true, rev: meta.rev, updatedAt: meta.updatedAt, device: meta.device || '', error: 'Another device saved newer data.' });
      }
      const next = {
        rev: (Number(meta.rev) || 0) + 1, updatedAt: Date.now(), createdAt: meta.createdAt || Date.now(),
        size: data.length, enc: body.enc === 'gzip64' ? 'gzip64' : 'json', device: String(body.device || '').slice(0, 60)
      };
      await store.set(k.data, data);
      await store.set(k.meta, JSON.stringify(next));
      return reply(200, { ok: true, rev: next.rev, updatedAt: next.updatedAt });
    }

    return reply(400, { ok: false, error: 'Unknown action.' });
  } catch (error) {
    return reply(500, { ok: false, error: 'Cloud sync failed. Try again in a moment.' });
  }
};
