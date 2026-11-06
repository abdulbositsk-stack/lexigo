# Hosting LexiGo on Cloudflare Pages

LexiGo builds with Vite into `dist`. The server parts live in `server/` and are
plain Web-API code, so they run on Cloudflare Pages Functions (`functions/api/`)
and also on Netlify (`netlify/`, kept as a fallback).

| Route               | What it does                              | Needs                                  |
|---------------------|-------------------------------------------|----------------------------------------|
| `/api/auto-telegram`| Links Telegram groups and sends reports   | `LEXIGO_KV`, `TELEGRAM_BOT_TOKEN`       |
| `/api/telegram`     | Older relay-key Telegram sender           | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_RELAY_KEY` |
| `/api/cloud-sync`   | Cloud sync with a private code            | `LEXIGO_KV`                            |
| `/api/ai-words`     | AI word import (Gemini)                   | `GEMINI_API_KEY` (optional `GEMINI_MODEL`) |
| `/api/health`       | Shows which settings are set (true/false only) | nothing |

## One-time setup

1. **Create the project.** Cloudflare dashboard → Workers & Pages → Create →
   Pages → *Connect to Git* → pick the `lexigo` repository.
   - Framework preset: *None* (or Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version comes from `.nvmrc` (22).
2. **Create the storage.** Workers & Pages → KV → Create a namespace named
   `lexigo-kv`.
3. **Bind it.** The Pages project → Settings → Bindings → Add → KV namespace.
   Variable name `LEXIGO_KV`, namespace `lexigo-kv`. Do it for Production
   (and Preview if you use previews).
4. **Secrets.** The Pages project → Settings → Variables and Secrets → add as
   *Secret* (never in code or GitHub):
   - `TELEGRAM_BOT_TOKEN`
   - `GEMINI_API_KEY` (if AI word import is used)
   - `LEXIGO_TELEGRAM_ENCRYPTION_KEY` (only for "use my own bot")
   - `TELEGRAM_RELAY_KEY` (only for the older relay sender)
5. **Redeploy** (Deployments → Retry deployment) so the bindings apply.
6. Optional: Custom domains → add your own domain.

## After the move

Data saved by the Netlify functions (Telegram group links, cloud sync codes)
stays in Netlify Blobs and is not copied. Teachers connect each Telegram group
once more, and turn cloud sync on again on one device to get a new code.
Everything in the browser (groups, names, words, results) is untouched, but it
belongs to the old site address: open the old site, download a backup in
Settings, and restore it on the new address.

## Local test

```
npm run build
npx wrangler pages dev dist --kv LEXIGO_KV
```

## Check the settings

Open `/api/health` on the site. It shows `true`/`false` for each secret and
binding (never the values). Secrets only apply to a new deployment, and the
project must be connected to Git (Settings → Build → Git repository) for a push
to `main` to deploy.
