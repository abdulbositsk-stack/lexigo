// Cloudflare Pages Function: POST /api/cloud-sync
// Needs a KV namespace bound as LEXIGO_KV.
import { handleCloudSync } from '../../server/cloud-sync.js';
import { kvStore } from '../../server/lib.js';

export const onRequest = ({ request, env }) =>
  handleCloudSync(request, env, env.LEXIGO_KV ? kvStore(env.LEXIGO_KV, 'cloud:') : null);
