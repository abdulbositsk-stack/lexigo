# LexiGo Auto Send with My Bot

The app is ready for a teacher to connect their own BotFather bot. Before the
first production use, add one secret in Netlify:

1. Open **Netlify → your LexiGo site → Project configuration → Environment variables**.
2. Add `LEXIGO_TELEGRAM_ENCRYPTION_KEY` with a long, private random value (at least 32 characters).
3. Mark it as a secret and redeploy the site.

LexiGo stores each teacher's bot token encrypted in Netlify Blobs. It never
returns a saved token to the browser and the token must never be committed to
GitHub. A teacher's browser holds only a random connection key, which lets that
browser manage its own encrypted bot record.

Teacher flow:

1. Create a bot in BotFather and copy the token.
2. In **Settings → Auto Send with My Bot**, paste the token and save.
3. Add that bot to the desired Telegram group.
4. Send `/connect` inside the Telegram group.
5. In LexiGo, choose **Find my groups**, pick the detected group, and save it
   for the class.
6. After a quiz, press **Auto send report**.

The `/connect` command is required so LexiGo can identify the correct group.
Groups are saved by Telegram's unique chat ID, not only by their title, so two
groups with the same name cannot be mixed up.
