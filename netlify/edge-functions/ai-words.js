import { handleAiWords } from '../../server/ai-words.js';

export default request => handleAiWords(request, {
  GEMINI_API_KEY: Netlify.env.get('GEMINI_API_KEY'),
  GEMINI_MODEL: Netlify.env.get('GEMINI_MODEL')
});
export const config = { path: '/api/ai-words', method: 'POST' };
