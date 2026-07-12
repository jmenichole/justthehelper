# JustTheHelper — Deploy & Smoke Checklist

Manual steps for Task 10 (production deploy + smoke). Complete in order; do not enable Discord Discovery until smoke passes.

**App:** `justthehelper` on Fly.io (`https://justthehelper.fly.dev`)  
**SKU:** Guild subscription at **$1.99/mo** → `HELPER_SKU_ID`  
**Spec:** [2026-07-12-justthehelper-design.md](superpowers/specs/2026-07-12-justthehelper-design.md)

---

## Prerequisites (automated checks)

| Check | Result |
|-------|--------|
| `npm test` | **PASS** — 10 tests, 0 failures (5 suites, ~2.4s) |
| Fly CLI (`fly version` / `fly auth whoami`) | **Not available** — `fly` and `flyctl` are not installed on this machine. Install [Fly CLI](https://fly.io/docs/flyctl/install/) and run `fly auth login` before Step 2. |

---

## Step 1: Discord application (human)

- [ ] Create Discord Application **JustTheHelper** in the [Developer Portal](https://discord.com/developers/applications)
- [ ] Create a **Bot** user; copy the bot token (store locally — never commit)
- [ ] Enable intents as needed: **Guilds**; **Guild Members** only if role grant requires it (prefer fetching member on interaction without GuildMembers intent when possible)
- [ ] Create a **guild subscription** SKU at **$1.99/mo**; copy the SKU ID → `HELPER_SKU_ID`
- [ ] Generate an **invite URL** with scopes:
  - `bot`
  - `applications.commands`
- [ ] Set bot **permissions** (minimum for v1):
  - Manage Roles
  - Send Messages
  - Create Private Threads
  - Manage Threads
  - Embed Links
- [ ] Do **not** enable Discovery until smoke (Step 3) passes

---

## Step 2: Fly.io deploy (human)

Install and authenticate Fly CLI first if needed:

```bash
# Install: https://fly.io/docs/flyctl/install/
fly auth login
fly version
fly auth whoami
```

Create the app and set secrets (fill in real values from your local `.env` — do not commit secrets):

```bash
fly apps create justthehelper
fly secrets set \
  DISCORD_TOKEN=<your-bot-token> \
  BOT_OWNER_ID=<your-discord-user-id> \
  HELPER_SKU_ID=<guild-subscription-sku-id> \
  OPS_GUILD_ID=<ops-guild-id> \
  OPS_ERROR_CHANNEL_ID=<channel-id> \
  OPS_ANALYTICS_CHANNEL_ID=<channel-id> \
  OPS_SUPPORT_CHANNEL_ID=<channel-id> \
  -a justthehelper
fly deploy -a justthehelper
curl https://justthehelper.fly.dev/health
```

**Expected health response:**

```json
{"status":"ok","uptime":<seconds>}
```

Optional status endpoint: `GET https://justthehelper.fly.dev/status` → `{ status, uptime, guilds, env }`.

---

## Step 3: Manual smoke (human)

Run in a test guild with the bot invited.

1. [ ] **Install analytics** — Invite bot → confirm `guild_install` event in ops analytics channel
2. [ ] **Welcome + verify** — `/welcome set-role` → `/welcome post` → click **Verify** → role granted
3. [ ] **Optional welcome DM** — `/welcome set-dm` + `/welcome dm on` → Verify again (or remove role first) → DM received, or silent skip if DMs closed
4. [ ] **Reminders** — `/remind when:1m text:ping` → DM within ~1–2 minutes
5. [ ] **Ticket gate (deny)** — Without SKU/entitlement: `/tickets panel` → denied (`unlock_denied` analytics)
6. [ ] **Ticket flow (allow)** — With test entitlement or bot-owner bypass: `/tickets setup` → `/tickets panel` → **Open** → **Claim** → **Close**
7. [ ] **Copy sanity** — Confirm no `/setup`, no Groq, no Builder strings in bot replies

---

## Step 4: Post-smoke (human, optional)

- [ ] Commit any smoke-test fixes if needed
- [ ] Tag `v0.1.0` (optional)

```bash
git commit -m "fix: smoke-test follow-ups for JustTheHelper v0.1"
git tag v0.1.0   # optional
```

- [ ] Enable Discord Discovery when ready

---

## Environment reference

See [`.env.example`](../.env.example) for all required variables. Production secrets are set via `fly secrets set` (Step 2), not committed to git.
