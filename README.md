# JustTheHelper

Discord utility bot for **welcome + verify**, **personal reminders**, and **paid private-thread support tickets**.

Full product design: [docs/superpowers/specs/2026-07-12-justthehelper-design.md](docs/superpowers/specs/2026-07-12-justthehelper-design.md)

## What it does

- **Welcome & verify** — Admins post a welcome embed with a Verify button; members click to receive a configured role. Optional DM blurb after successful verify (off by default).
- **Reminders** — `/remind` schedules a personal reminder; the bot DMs you when it is due.
- **Tickets** — With an active guild subscription, staff can run a private-thread ticket panel (open → claim → close).

## Freemium

| Tier | Features |
|------|----------|
| **Free** | Welcome embed + Verify button → one role; optional welcome DM (default off); `/remind` personal reminders |
| **$1.99/mo guild subscription** | Ticket setup, panel, and private-thread support flow (open / claim / close) |

Billing is handled through **Ko-fi** (recommended) or optionally the Discord app store.

## Commands

| Command | Description |
|---------|-------------|
| `/welcome` | Configure and post welcome + verify (`post`, `set-role`, `dm`, `set-dm`) |
| `/remind` | Schedule a personal reminder (`<when> <text>`) |
| `/subscribe` | Show Ko-fi link + server link code; check subscription status |
| `/tickets` | Ticket setup and panel (requires active subscription) |

## Run locally

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN, Ko-fi billing vars, ops channels as needed
npm start
```

### Ko-fi billing setup

1. Create a **$1.99/mo membership** on [Ko-fi](https://ko-fi.com)
2. Open [Ko-fi webhooks](https://ko-fi.com/manage/webhooks) and set the URL to:
   `https://justthehelper.fly.dev/webhooks/kofi`
3. Copy the verification token → `KOFI_VERIFICATION_TOKEN`
4. Set `KOFI_PAGE_URL` to your Ko-fi page or membership link
5. In a test server, run `/subscribe` → pay on Ko-fi and include the **server link code** in the payment message
6. Run `/subscribe status` — tickets should unlock for ~31 days; renewals extend via Ko-fi webhook

The subscription is **guild-level**: an admin pays so the server can use tickets. Members do not pay to open a ticket. The bot owner can bypass the ticket gate for testing.

Development with auto-reload: `npm run dev`

Tests: `npm test`

## Deploy

Production runs on [Fly.io](https://fly.io) as **`justthehelper`**.

## Legal

- [Privacy Policy](privacy.md)
- [Terms of Service](terms.md)
