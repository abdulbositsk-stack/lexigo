// Cloudflare Pages Function: GET /api/health
// Shows only whether each setting exists (true/false). Never shows the values.
export const onRequest = ({ env }) => new Response(JSON.stringify({
  ok: true,
  GEMINI_API_KEY: Boolean(env.GEMINI_API_KEY),
  TELEGRAM_BOT_TOKEN: Boolean(env.TELEGRAM_BOT_TOKEN),
  TELEGRAM_RELAY_KEY: Boolean(env.TELEGRAM_RELAY_KEY),
  LEXIGO_KV: Boolean(env.LEXIGO_KV)
}, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
