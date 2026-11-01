// Helpers shared by the LexiGo server handlers. They use only Web APIs
// (fetch, Web Crypto, atob/btoa), so the same code runs on Netlify and on
// Cloudflare Pages Functions.

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

const enc = new TextEncoder();

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function sha256Hex(text) {
  return toHex(await sha256(text));
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function toBase64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function aesKey(secret) {
  return crypto.subtle.importKey('raw', await sha256(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Format: iv.tag.data (base64), the same as the earlier Node version, so
// records saved before the move still decrypt.
export async function encryptText(secret, value) {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(value)));
  const data = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  return [toBase64(iv), toBase64(tag), toBase64(data)].join('.');
}

export async function decryptText(secret, value) {
  const [ivB64, tagB64, dataB64] = String(value || '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Saved bot connection is invalid. Save your bot token again.');
  const sealed = concat(fromBase64(dataB64), fromBase64(tagB64));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, await aesKey(secret), sealed);
  return new TextDecoder().decode(plain);
}

// A small key-value store: { get(key) -> parsed JSON or null,
// getText(key) -> string or null, set(key, string), delete(key) }.
export function kvStore(kv, prefix) {
  return {
    get: key => kv.get(prefix + key, 'json'),
    getText: key => kv.get(prefix + key),
    set: (key, value) => kv.put(prefix + key, value),
    delete: key => kv.delete(prefix + key)
  };
}

export function blobStore(store) {
  return {
    get: key => store.get(key, { type: 'json' }),
    getText: key => store.get(key),
    set: (key, value) => store.set(key, value),
    delete: key => store.delete(key)
  };
}
