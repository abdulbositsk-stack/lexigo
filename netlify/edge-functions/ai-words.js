// AI word import: sends a teacher's file (PDF, image) or text to Gemini and
// streams back LexiGo word JSON. Runs as an Edge Function so a long word list
// is not cut off by the 10s limit of regular Netlify functions.
// The Gemini key lives only in the GEMINI_API_KEY environment variable.

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000;
const FILE_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

const RULES = `You extract vocabulary for LexiGo, an English/Uzbek vocabulary app used by teachers in Uzbekistan.
The source may mix English words or phrases with Uzbek translations, Cyrillic or Latin Uzbek, written transcriptions, numbering, page headers, exercise instructions and other text.

Rules:
1. Return ONLY the English vocabulary items that the source is teaching. Ignore Uzbek text, transcriptions, numbers, headings, instructions, names and page furniture.
2. Keep multi-word phrases together ("get up", "good morning"). Never merge two items or split one item.
3. Fix obvious spelling or OCR mistakes in the English word. Use lowercase unless the word is a proper noun or "I".
4. Each word appears once, in the order it appears in the source.
5. "uzb": a short, natural Uzbek meaning in Latin script. If the source gives an Uzbek meaning, use it (converted to Latin script); otherwise translate.
6. "emoji": one emoji that pictures the word itself. Never use a book or generic learning emoji unless the word is about books or learning.`;

const MODE_RULES = {
  kids: `7. "pronunciation": a kid-friendly respelling of how the English word sounds, written so an Uzbek child can read it with Uzbek Latin letters, e.g. beautiful -> "byutiful", adventure -> "edvencher", cat -> "ket". No IPA symbols.
8. Leave "examples" and "synonyms" out.`,
  adult: `7. "pronunciation": the British IPA transcription between slashes, e.g. "/ˈkjʊəriəs/".
8. "examples": three example sentences using the word: "easy" (short and simple), "normal" (natural everyday), "hard" (longer, upper-intermediate).
9. "synonyms": one or two common synonyms, or an empty list if none fit.`
};

function schema(mode) {
  const word = {
    type: 'OBJECT',
    properties: {
      word: { type: 'STRING' },
      pronunciation: { type: 'STRING' },
      uzb: { type: 'STRING' },
      emoji: { type: 'STRING' }
    },
    required: ['word', 'pronunciation', 'uzb', 'emoji']
  };
  if (mode === 'adult') {
    word.properties.examples = {
      type: 'OBJECT',
      properties: { easy: { type: 'STRING' }, normal: { type: 'STRING' }, hard: { type: 'STRING' } },
      required: ['easy', 'normal', 'hard']
    };
    word.properties.synonyms = { type: 'ARRAY', items: { type: 'STRING' } };
    word.required.push('examples', 'synonyms');
  }
  return { type: 'OBJECT', properties: { words: { type: 'ARRAY', items: word } }, required: ['words'] };
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only.' });

  const key = Netlify.env.get('GEMINI_API_KEY');
  if (!key) return json(503, { ok: false, error: 'GEMINI_API_KEY is not set in Netlify environment variables.' });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: 'Invalid JSON body.' }); }

  const mode = body.mode === 'adult' ? 'adult' : 'kids';
  const parts = [];
  if (body.file && body.file.data) {
    const mimeType = String(body.file.mimeType || '').toLowerCase();
    if (!FILE_TYPES.test(mimeType)) return json(415, { ok: false, error: 'Use a PDF or an image (PNG, JPG, WEBP, HEIC).' });
    if (body.file.data.length * 0.75 > MAX_FILE_BYTES) return json(413, { ok: false, error: 'File is larger than 5 MB.' });
    parts.push({ inline_data: { mime_type: mimeType, data: body.file.data } });
  }
  const text = String(body.text || '').trim().slice(0, MAX_TEXT_CHARS);
  if (text) parts.push({ text: 'Source text:\n' + text });
  if (!parts.length) return json(400, { ok: false, error: 'Send a file or some text.' });
  parts.push({ text: RULES + '\n' + MODE_RULES[mode] });

  const model = Netlify.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const request_ = fetch(`${GEMINI_API}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema(mode) }
    })
  });

  // Start the response straight away and keep it alive with SSE comments while
  // Gemini reads the file, so a slow first reply doesn't time out the function.
  // Failures are sent as an SSE error event, which the browser shows as a message.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const ping = setInterval(() => writer.write(encoder.encode(': ping\n\n')).catch(() => {}), 5000);
  (async () => {
    try {
      const upstream = await request_;
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => '');
        let message = 'Gemini returned HTTP ' + upstream.status;
        try { message = JSON.parse(detail).error.message || message; } catch {}
        throw new Error(message);
      }
      const reader = upstream.body.getReader();
      let first = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (first) { clearInterval(ping); first = false; }
        await writer.write(value);
      }
    } catch (err) {
      await writer.write(encoder.encode('data: ' + JSON.stringify({ error: { message: err.message } }) + '\n\n')).catch(() => {});
    } finally {
      clearInterval(ping);
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }
  });
};

export const config = { path: '/api/ai-words', method: 'POST' };
