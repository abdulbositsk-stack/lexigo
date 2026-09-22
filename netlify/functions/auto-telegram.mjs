import { getStore } from '@netlify/blobs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const TELEGRAM_API = 'https://api.telegram.org';
const STORE_NAME = 'lexigo-auto-telegram-v1';

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function cleanKey(value) {
  const key = String(value || '').trim();
  return /^[a-f0-9]{64}$/i.test(key) ? key.toLowerCase() : '';
}

function recordKey(teacherKey) {
  return 'teacher/' + createHash('sha256').update(teacherKey).digest('hex') + '.json';
}

function cipherKey() {
  const secret = process.env.LEXIGO_TELEGRAM_ENCRYPTION_KEY || '';
  if (secret.length < 24) throw new Error('Auto Bot is not configured yet. Add LEXIGO_TELEGRAM_ENCRYPTION_KEY in Netlify environment variables.');
  return createHash('sha256').update(secret).digest();
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

function decrypt(value) {
  const [ivB64, tagB64, dataB64] = String(value || '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Saved bot connection is invalid. Save your bot token again.');
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

async function telegram(token, method, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed.`);
  return data.result;
}

async function telegramForm(token, method, form) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed.`);
  return data.result;
}

function messageChunks(text, limit = 3900) {
  const chunks = [];
  let remaining = String(text || '').trim();
  while (remaining.length > limit) {
    let at = remaining.lastIndexOf('\n', limit);
    if (at < limit * 0.55) at = remaining.lastIndexOf(' ', limit);
    if (at < 1) at = limit;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function groupFromUpdate(update) {
  const message = update.message || update.channel_post;
  if (!message || !/^\/connect(?:@\w+)?(?:\s|$)/i.test(String(message.text || ''))) return null;
  const chat = message.chat;
  if (!chat || !['group', 'supergroup'].includes(chat.type)) return null;
  return { id: String(chat.id), title: String(chat.title || 'Unnamed Telegram group') };
}

async function readRecord(store, teacherKey) {
  const record = await store.get(recordKey(teacherKey), { type: 'json' });
  if (!record || !record.token) throw new Error('No bot is connected in this browser yet. Save your BotFather token first.');
  return record;
}

async function readBot(store, teacherKey) {
  const record = await readRecord(store, teacherKey);
  return { record, token: decrypt(record.token) };
}

export default async request => {
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'POST only.' });

  let body;
  try { body = JSON.parse(await request.text() || '{}'); }
  catch { return reply(400, { ok: false, error: 'Invalid request.' }); }

  const teacherKey = cleanKey(body.teacherKey);
  if (!teacherKey) return reply(400, { ok: false, error: 'This browser connection key is missing. Refresh and try again.' });

  let store;
  try { store = getStore(STORE_NAME); }
  catch (error) { return reply(503, { ok: false, error: 'Secure Auto Bot storage is unavailable.' }); }

  try {
    if (body.action === 'configure') {
      const token = String(body.token || '').trim();
      if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) return reply(400, { ok: false, error: 'That does not look like a BotFather token.' });
      const bot = await telegram(token, 'getMe', {});
      const previous = await store.get(recordKey(teacherKey), { type: 'json' }) || {};
      await store.set(recordKey(teacherKey), JSON.stringify({
        token: encrypt(token), groups: previous.groups || {}, createdAt: previous.createdAt || Date.now(), updatedAt: Date.now()
      }));
      return reply(200, { ok: true, bot: { username: bot.username || '', name: bot.first_name || 'Your bot' } });
    }

    const { record, token } = await readBot(store, teacherKey);

    if (body.action === 'groups') {
      const updates = await telegram(token, 'getUpdates', {
        limit: 100, allowed_updates: ['message', 'channel_post', 'my_chat_member']
      });
      const groups = new Map();
      for (const update of updates || []) {
        const group = groupFromUpdate(update);
        if (group) groups.set(group.id, group);
      }
      Object.values(record.groups || {}).forEach(group => {
        if (group && group.id) groups.set(String(group.id), { id: String(group.id), title: String(group.title || 'Saved Telegram group') });
      });
      return reply(200, { ok: true, groups: [...groups.values()] });
    }

    if (body.action === 'save-group') {
      const classId = String(body.classId || '').trim();
      const chatId = String(body.chatId || '').trim();
      const title = String(body.title || '').trim();
      if (!classId || !/^-?\d+$/.test(chatId) || !title) return reply(400, { ok: false, error: 'Choose a valid Telegram group first.' });
      const groups = { ...(record.groups || {}), [classId]: { id: chatId, title, savedAt: Date.now() } };
      await store.set(recordKey(teacherKey), JSON.stringify({ ...record, groups, updatedAt: Date.now() }));
      return reply(200, { ok: true, group: groups[classId] });
    }

    if (body.action === 'status') {
      const classId = String(body.classId || '').trim();
      const group = classId ? (record.groups || {})[classId] : null;
      return reply(200, { ok: true, connected: true, group: group || null });
    }

    if (body.action === 'send') {
      const classId = String(body.classId || '').trim();
      const group = (record.groups || {})[classId];
      const text = String(body.text || '').trim();
      const shortText = String(body.shortText || '').trim();
      if (!group || !/^-?\d+$/.test(String(group.id))) return reply(400, { ok: false, error: 'No Telegram group is saved for this class. Open Settings → Auto Send with My Bot first.' });
      if (!text) return reply(400, { ok: false, error: 'Report text is empty.' });

      const dataUrl = String(body.imageDataUrl || '');
      if (dataUrl) {
        const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (!match) return reply(400, { ok: false, error: 'The report image is invalid.' });
        const bytes = Buffer.from(match[1], 'base64');
        if (bytes.length > 9 * 1024 * 1024) return reply(400, { ok: false, error: 'The report image is too large. Try a shorter report.' });
        const form = new FormData();
        form.append('chat_id', String(group.id));
        form.append('caption', (shortText || text).slice(0, 1000));
        form.append('photo', new Blob([bytes], { type: 'image/png' }), 'lexigo-report.png');
        await telegramForm(token, 'sendPhoto', form);
      }
      const shouldSendText = !dataUrl || text !== shortText;
      if (shouldSendText) {
        for (const part of messageChunks(text)) await telegram(token, 'sendMessage', { chat_id: group.id, text: part });
      }
      return reply(200, { ok: true, group: { id: String(group.id), title: group.title } });
    }

    return reply(400, { ok: false, error: 'Unknown Auto Bot action.' });
  } catch (error) {
    return reply(502, { ok: false, error: error.message || 'Telegram connection failed.' });
  }
};
