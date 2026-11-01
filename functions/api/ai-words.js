// Cloudflare Pages Function: POST /api/ai-words
import { handleAiWords } from '../../server/ai-words.js';

export const onRequest = ({ request, env }) => handleAiWords(request, env);
