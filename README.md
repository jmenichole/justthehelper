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

The subscription is **guild-level**: an admin pays so the server can use tickets. Members do not pay to open a ticket. The bot owner can bypass the ticket gate for testing.

## Commands

| Command | Description |
|---------|-------------|
| `/welcome` | Configure and post welcome + verify (`post`, `set-role`, `dm`, `set-dm`) |
| `/remind` | Schedule a personal reminder (`<when> <text>`) |
| `/tickets` | Ticket setup and panel (requires guild subscription) |

## Run locally

```bash
npm install
cp .env.example .env   # fill in DISCORD_TOKEN, HELPER_SKU_ID, ops channels as needed
npm start
```

Development with auto-reload: `npm run dev`

Tests: `npm test`

## Deploy

Production runs on [Fly.io](https://fly.io) as **`justthehelper`**.

## Legal

- [Privacy Policy](privacy.md)
- [Terms of Service](terms.md)
