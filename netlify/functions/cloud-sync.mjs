import { getStore } from '@netlify/blobs';
import { handleCloudSync } from '../../server/cloud-sync.js';
import { blobStore } from '../../server/lib.js';

export default request => {
  let store = null;
  try { store = blobStore(getStore('lexigo-cloud-sync-v1')); } catch {}
  return handleCloudSync(request, process.env, store);
};
export const config = { path: '/api/cloud-sync' };
