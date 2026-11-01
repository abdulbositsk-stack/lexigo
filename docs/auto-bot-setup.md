# LexiGo Telegram reports

Teachers send each group's report (poster + caption) to its Telegram group
with one tap. By default everyone uses one shared LexiGo bot, so teachers
never need BotFather.

## One-time setup (site owner)

1. In Telegram, open **@BotFather**, create the LexiGo bot (`/newbot`) and copy
   its token. Never paste the token in chat, code or GitHub.
2. In **Cloudflare → Workers & Pages → the LexiGo project → Settings →
   Variables and Secrets**, add `TELEGRAM_BOT_TOKEN` as a **Secret**.
   (See `docs/cloudflare-pages.md` for the full hosting setup.)
3. Redeploy the site.

`LEXIGO_TELEGRAM_ENCRYPTION_KEY` is only needed if teachers use the optional
"Use my own bot instead" setting.

## Teacher flow

1. Open a group in LexiGo and press **Connect Telegram group** (or press
   **Send Report** on a group card that is not connected yet).
2. Press **Add @bot to your Telegram group** and pick the group.
3. Send the shown message, for example `/connect 482913`, in that group.
4. LexiGo links the group by itself within a few seconds.
5. From then on, **Send Report** posts the report poster, caption and
   7-day graph straight to that Telegram group.

Codes are single-use and expire after 30 minutes. Groups are saved by
Telegram's unique chat ID, so groups with the same name never mix. The link is
remembered per browser; on a new device, connect once again.
