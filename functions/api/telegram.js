// Cloudflare Pages Function: POST /api/telegram
import { handleTelegram } from '../../server/telegram.js';

export const onRequest = ({ request, env }) => handleTelegram(request, env);
