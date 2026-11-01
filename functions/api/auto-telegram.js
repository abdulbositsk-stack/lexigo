// Cloudflare Pages Function: POST /api/auto-telegram
// Needs a KV namespace bound as LEXIGO_KV.
import { handleAutoTelegram } from '../../server/auto-telegram.js';
import { kvStore } from '../../server/lib.js';

export const onRequest = ({ request, env }) =>
  handleAutoTelegram(request, env, env.LEXIGO_KV ? kvStore(env.LEXIGO_KV, 'tg:') : null);
