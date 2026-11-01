import { getStore } from '@netlify/blobs';
import { handleAutoTelegram } from '../../server/auto-telegram.js';
import { blobStore } from '../../server/lib.js';

export default request => {
  let store = null;
  try { store = blobStore(getStore('lexigo-auto-telegram-v1')); } catch {}
  return handleAutoTelegram(request, process.env, store);
};
export const config = { path: '/api/auto-telegram' };
