const TELEGRAM_API = 'https://api.telegram.org';

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

async function telegram(token, method, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}

function chunks(text, size = 4000) {
  const result = [];
  let remaining = String(text || '').trim();
  while (remaining.length > size) {
    let at = remaining.lastIndexOf('\n', size);
    if (at < size * 0.6) at = remaining.lastIndexOf(' ', size);
    if (at < 1) at = size;
    result.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  if (remaining) result.push(remaining);
  return result;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only.' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const relayKey = process.env.TELEGRAM_RELAY_KEY;
  if (!token || !relayKey) {
    return json(503, { ok: false, error: 'Telegram is not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_RELAY_KEY in Netlify, then redeploy.' });
  }
  if (request.headers.get('x-lexigo-relay-key') !== relayKey) {
    return json(401, { ok: false, error: 'Telegram access key is required.' });
  }

  let body;
  try { body = JSON.parse(await request.text() || '{}'); }
  catch { return json(400, { ok: false, error: 'Invalid request.' }); }

  try {
    if (body.action === 'groups') {
      const updates = await telegram(token, 'getUpdates', { limit: 100, allowed_updates: ['message', 'channel_post', 'my_chat_member'] });
      const groups = new Map();
      for (const update of updates || []) {
        const chat = update.message?.chat || update.channel_post?.chat || update.my_chat_member?.chat;
        if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
          groups.set(String(chat.id), { id: String(chat.id), title: chat.title || `Group ${chat.id}` });
        }
      }
      return json(200, { ok: true, groups: [...groups.values()] });
    }

    if (body.action === 'send') {
      const chatId = String(body.chatId || '').trim();
      const messageParts = chunks(body.text);
      if (!/^-?\d+$/.test(chatId) || !messageParts.length) return json(400, { ok: false, error: 'A group and report text are required.' });
      for (const text of messageParts) await telegram(token, 'sendMessage', { chat_id: chatId, text });
      return json(200, { ok: true });
    }

    return json(400, { ok: false, error: 'Unknown Telegram action.' });
  } catch (error) {
    return json(502, { ok: false, error: error.message || 'Telegram request failed.' });
  }
};
