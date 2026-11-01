import { json as reply, decryptText, encryptText, fromBase64, randomBytes, sha256Hex } from './lib.js';

const TELEGRAM_API = 'https://api.telegram.org';

function cleanKey(value) {
  const key = String(value || '').trim();
  return /^[a-f0-9]{64}$/i.test(key) ? key.toLowerCase() : '';
}

async function recordKey(teacherKey) {
  return 'teacher/' + await sha256Hex(teacherKey) + '.json';
}

function cipherSecret(env) {
  const secret = String(env.LEXIGO_TELEGRAM_ENCRYPTION_KEY || '');
  if (secret.length < 24) throw new Error('Auto Bot is not configured yet. Add LEXIGO_TELEGRAM_ENCRYPTION_KEY to the site environment variables.');
  return secret;
}

const encrypt = (env, value) => encryptText(cipherSecret(env), value);
const decrypt = (env, value) => decryptText(cipherSecret(env), value);

async function telegram(token, method, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw telegramError(data, method);
  return data.result;
}

function telegramError(data, method) {
  const error = new Error(data.description || `Telegram ${method} failed.`);
  if (data.parameters && data.parameters.migrate_to_chat_id) error.migrateTo = String(data.parameters.migrate_to_chat_id);
  return error;
}

// The shared LexiGo bot: its token lives only in the site environment
// variable TELEGRAM_BOT_TOKEN, so teachers never need BotFather at all.
function sharedToken(env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token) ? token : '';
}

let sharedBotCache = null;
async function sharedBotInfo(env) {
  const token = sharedToken(env);
  if (!token) return null;
  if (!sharedBotCache) {
    const me = await telegram(token, 'getMe', {});
    sharedBotCache = { username: me.username || '', name: me.first_name || 'LexiGo bot' };
  }
  return sharedBotCache;
}

function pairCommand(text) {
  const m = String(text || '').match(/^\/connect(?:@\w+)?\s+(\d{6})\b/i);
  return m ? m[1] : '';
}

// Reads new updates of the shared bot once (moving the offset forward so the
// queue never fills up) and remembers every "/connect 123456" seen in a group.
async function collectSharedPairs(store, token) {
  const state = await store.get('shared/offset.json') || {};
  const updates = await telegram(token, 'getUpdates', {
    offset: state.next || 0, limit: 100, timeout: 0, allowed_updates: ['message', 'channel_post']
  });
  let next = state.next || 0;
  for (const update of updates || []) {
    next = Math.max(next, update.update_id + 1);
    const message = update.message || update.channel_post;
    if (!message || !message.chat || !['group', 'supergroup'].includes(message.chat.type)) continue;
    const code = pairCommand(message.text);
    if (!code) continue;
    const pending = await store.get('pending/' + code + '.json');
    if (!pending || pending.exp < Date.now()) continue;
    await store.delete('pending/' + code + '.json').catch(() => {});
    await store.set('pair/' + code + '.json', JSON.stringify({
      id: String(message.chat.id), title: String(message.chat.title || 'Telegram group'), at: Date.now()
    }));
    telegram(token, 'sendMessage', { chat_id: message.chat.id, text: '✅ LexiGo ushbu guruhga ulandi. Hisobotlar shu yerga keladi.' }).catch(() => {});
  }
  if (next !== (state.next || 0)) await store.set('shared/offset.json', JSON.stringify({ next, at: Date.now() }));
}

async function telegramForm(token, method, form) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw telegramError(data, method);
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

// A teacher's own bot (advanced) wins; otherwise the shared LexiGo bot is used.
async function readBot(store, env, teacherKey) {
  const record = await store.get(await recordKey(teacherKey)) || { groups: {} };
  if (record.token) return { record, token: await decrypt(env, record.token), shared: false };
  const token = sharedToken(env);
  if (!token) throw new Error('Telegram is not set up on this LexiGo site yet. The site owner needs to add TELEGRAM_BOT_TOKEN to the site environment variables.');
  return { record, token, shared: true };
}

export async function handleAutoTelegram(request, env, store) {
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'POST only.' });

  let body;
  try { body = JSON.parse(await request.text() || '{}'); }
  catch { return reply(400, { ok: false, error: 'Invalid request.' }); }

  const teacherKey = cleanKey(body.teacherKey);
  if (!teacherKey) return reply(400, { ok: false, error: 'This browser connection key is missing. Refresh and try again.' });

  if (!store) return reply(503, { ok: false, error: 'Secure Auto Bot storage is unavailable.' });
  const rkey = await recordKey(teacherKey);

  try {
    if (body.action === 'configure') {
      const token = String(body.token || '').trim();
      if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) return reply(400, { ok: false, error: 'That does not look like a BotFather token.' });
      const bot = await telegram(token, 'getMe', {});
      const previous = await store.get(rkey) || {};
      await store.set(rkey, JSON.stringify({
        token: await encrypt(env, token), groups: previous.groups || {}, createdAt: previous.createdAt || Date.now(), updatedAt: Date.now()
      }));
      return reply(200, { ok: true, bot: { username: bot.username || '', name: bot.first_name || 'Your bot' } });
    }

    if (body.action === 'info') {
      const record = await store.get(rkey) || {};
      let bot = null;
      try { bot = await sharedBotInfo(env); } catch (e) { bot = null; }
      return reply(200, { ok: true, shared: !!bot, ownBot: !!record.token, bot, groups: record.groups || {} });
    }

    const { record, token, shared } = await readBot(store, env, teacherKey);

    // Step 1 of the simple flow: LexiGo shows "/connect 123456" for the class.
    if (body.action === 'pair-start') {
      const classId = String(body.classId || '').trim();
      if (!classId) return reply(400, { ok: false, error: 'Choose a LexiGo group first.' });
      let code = '';
      for (let i = 0; i < 6 && !code; i++) {
        const candidate = String(100000 + (new DataView(randomBytes(4).buffer).getUint32(0) % 900000));
        if (!(await store.get('pending/' + candidate + '.json'))) code = candidate;
      }
      if (!code) return reply(503, { ok: false, error: 'Please try again.' });
      const pairing = { code, classId, exp: Date.now() + 30 * 60 * 1000 };
      if (record.pairing && record.pairing.code) await store.delete('pending/' + record.pairing.code + '.json').catch(() => {});
      await store.set('pending/' + code + '.json', JSON.stringify({ exp: pairing.exp }));
      await store.set(rkey, JSON.stringify({ ...record, groups: record.groups || {}, pairing, updatedAt: Date.now() }));
      let bot = null;
      if (shared) bot = await sharedBotInfo(env);
      else { const me = await telegram(token, 'getMe', {}); bot = { username: me.username || '', name: me.first_name || 'Your bot' }; }
      return reply(200, { ok: true, code, bot });
    }

    // Step 2: once "/connect 123456" was sent in the Telegram group, link it.
    if (body.action === 'pair-check') {
      const pairing = record.pairing;
      if (!pairing || pairing.exp < Date.now()) return reply(200, { ok: true, linked: false, expired: true });
      let found = await store.get('pair/' + pairing.code + '.json');
      if (!found) {
        if (shared) await collectSharedPairs(store, token);
        else {
          const updates = await telegram(token, 'getUpdates', { limit: 100, allowed_updates: ['message', 'channel_post'] });
          for (const update of updates || []) {
            const message = update.message || update.channel_post;
            if (message && message.chat && ['group', 'supergroup'].includes(message.chat.type) && pairCommand(message.text) === pairing.code) {
              await store.set('pair/' + pairing.code + '.json', JSON.stringify({ id: String(message.chat.id), title: String(message.chat.title || 'Telegram group'), at: Date.now() }));
            }
          }
        }
        found = await store.get('pair/' + pairing.code + '.json');
      }
      if (!found) return reply(200, { ok: true, linked: false });
      const group = { id: found.id, title: found.title, savedAt: Date.now() };
      const groups = { ...(record.groups || {}), [pairing.classId]: group };
      const { pairing: _done, ...rest } = record;
      await store.set(rkey, JSON.stringify({ ...rest, groups, updatedAt: Date.now() }));
      await store.delete('pair/' + pairing.code + '.json').catch(() => {});
      return reply(200, { ok: true, linked: true, classId: pairing.classId, group });
    }

    if (body.action === 'unlink') {
      const classId = String(body.classId || '').trim();
      const groups = { ...(record.groups || {}) };
      delete groups[classId];
      await store.set(rkey, JSON.stringify({ ...record, groups, updatedAt: Date.now() }));
      return reply(200, { ok: true });
    }

    if (body.action === 'groups') {
      if (shared) return reply(200, { ok: true, groups: Object.values(record.groups || {}) });
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
      await store.set(rkey, JSON.stringify({ ...record, groups, updatedAt: Date.now() }));
      return reply(200, { ok: true, group: groups[classId] });
    }

    if (body.action === 'status') {
      const classId = String(body.classId || '').trim();
      const group = classId ? (record.groups || {})[classId] : null;
      return reply(200, { ok: true, connected: true, shared, group: group || null, groups: record.groups || {} });
    }

    if (body.action === 'send') {
      const classId = String(body.classId || '').trim();
      const group = (record.groups || {})[classId];
      const text = String(body.text || '').trim();
      const shortText = String(body.shortText || '').trim();
      if (!group || !/^-?\d+$/.test(String(group.id))) return reply(400, { ok: false, error: 'No Telegram group is saved for this class. Open Settings → Telegram reports and link a group first.' });
      if (!text) return reply(400, { ok: false, error: 'Report text is empty.' });

      const images = [];
      for (const [name, value] of [['report', body.imageDataUrl], ['chart', body.chartDataUrl]]) {
        const dataUrl = String(value || '');
        if (!dataUrl) continue;
        const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (!match) return reply(400, { ok: false, error: 'The report image is invalid.' });
        const bytes = fromBase64(match[1]);
        if (bytes.length > 9 * 1024 * 1024) return reply(400, { ok: false, error: 'The report image is too large. Try a shorter report.' });
        images.push({ name, bytes });
      }
      const caption = (shortText || text).slice(0, 1000);
      try {
        await sendReport(token, String(group.id), images, caption, text, shortText);
      } catch (error) {
        if (!error.migrateTo) throw error;
        // The Telegram group became a supergroup: follow it to its new id.
        group.id = error.migrateTo;
        const groups = { ...(record.groups || {}), [classId]: group };
        await store.set(rkey, JSON.stringify({ ...record, groups, updatedAt: Date.now() }));
        await sendReport(token, String(group.id), images, caption, text, shortText);
      }
      return reply(200, { ok: true, group: { id: String(group.id), title: group.title } });
    }

    return reply(400, { ok: false, error: 'Unknown Auto Bot action.' });
  } catch (error) {
    return reply(502, { ok: false, error: friendlyError(error.message) });
  }
}

function friendlyError(message) {
  const text = String(message || '');
  if (/chat not found|bot was kicked|not a member|have no rights|need administrator/i.test(text)) {
    return 'LexiGo bot cannot post in that Telegram group. Make sure the bot is still in the group and allowed to send messages, or connect the group again.';
  }
  return text || 'Telegram connection failed.';
}

async function sendReport(token, chatId, images, caption, text, shortText) {
  const form = new FormData();
  form.append('chat_id', chatId);
  if (images.length === 1) {
    form.append('caption', caption);
    form.append('photo', new Blob([images[0].bytes], { type: 'image/png' }), 'lexigo-' + images[0].name + '.png');
    await telegramForm(token, 'sendPhoto', form);
  } else if (images.length > 1) {
    form.append('media', JSON.stringify(images.map((image, index) => ({
      type: 'photo', media: 'attach://' + image.name, ...(index === 0 ? { caption } : {})
    }))));
    images.forEach(image => form.append(image.name, new Blob([image.bytes], { type: 'image/png' }), 'lexigo-' + image.name + '.png'));
    await telegramForm(token, 'sendMediaGroup', form);
  }
  const shouldSendText = !images.length || text !== shortText;
  if (shouldSendText) {
    for (const part of messageChunks(text)) await telegram(token, 'sendMessage', { chat_id: chatId, text: part });
  }
}
