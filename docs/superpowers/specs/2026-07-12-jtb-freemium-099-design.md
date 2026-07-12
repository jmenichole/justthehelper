# JustTheBuilder Freemium ($0.99) Design

**Date:** 2026-07-12  
**Status:** Approved  
**Repo:** `jmenichole/justthebuilder`  
**SKU:** Existing Basic Build Pack (`PREMIUM_SKU_ID` / Discord SKU `1444371617319882863`) at **$0.99**

## Summary

JustTheBuilder becomes a true freemium server builder:

1. **Free:** bot install → AI interview → apply **categories + channel names only** (empty channels).
2. **Paid ($0.99 consumable):** unlock the rest of that same interview/blueprint — roles, permissions, AI embeds, pins, tickets, community flags — without re-interviewing.
3. **Pro subscription ($6.99/mo):** removed from product (stop selling / stop gating on it; retire SKU in Discord portal when ready).
4. **Grandfather:** guilds where the bot’s `joinedTimestamp` is **before 2026-07-11 00:00 UTC** get **one free full setup**. No blanket early-adopter free builds afterward.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Free deliverable | Categories + channel names only (Approach A) |
| Paid deliverable | Full polish from saved blueprint/answers ($0.99 Basic pack) |
| Pro Builder | Remove from monetization model |
| Grandfather | `guild.joinedTimestamp < 2026-07-11T00:00:00.000Z` → one free full apply |
| Early adopter JSON list | Stop using as free-build source of truth (optional cleanup later) |
| Payment rail | Discord Monetization only (existing consumable SKU; price set in Discord Dev Portal) |
| Soft tease | Not used — free path is real structure |

## Free vs paid inventory

### Free (always)

| Item | Notes |
|------|--------|
| Bot install + owner onboarding DM | Help + Start Setup |
| Full AI interview | Gather answers; persist blueprint/answers |
| Apply categories + channel names | No topics, no roles, no embeds, no pins, no tickets |
| Paywall summary at end | List gated items + store CTA for $0.99 pack |
| Upgrade path | “Unlock full customization” uses **saved** interview data |

### Paid — $0.99 Basic Build Pack (or grandfather free full)

| Item | Notes |
|------|--------|
| Roles + permission layout | From blueprint |
| Channel topics / descriptions | Applied on existing or new channels as blueprint defines |
| Welcome / rules / about / FAQ embeds | AI content |
| Auto-pin rules (and pin targets) | Part of polish apply |
| Ticket panel (if interview enabled) | Deploy + config |
| Community / welcome-screen flag | Whatever blueprint already supports |
| Consumable entitlement | Consumed after successful **full** apply |

### Removed

| Item | Notes |
|------|--------|
| Pro subscription gating | Presets that were Pro-only become available to anyone with pack **or** as free interview options (see below) |
| Unlimited rebuilds via Pro | Rebuilds require a new pack purchase (or remaining grandfather full) |
| Blanket early-adopter free builds | Replaced by join-date grandfather only |

**Presets:** After Pro removal, fast-track presets are available during the free interview (they only affect answers/blueprint). Applying polish still requires pack/grandfather. Do not leave a dead “Pro only” dead-end in UX.

## User flow

```
Invite bot
  → DM: Start Setup / Help
  → Interview (free)
  → Summary embed:
        ✅ Free now: categories + channel names
        🔒 $0.99 unlock: roles, perms, embeds, pins, tickets, …
        [Apply free structure]  [Unlock full setup — $0.99]
  → Apply free structure → empty named channels
  → If Unlock: check entitlement or grandfather
        → apply polish phases on same blueprint
        → consume Basic pack if used
```

If user buys later: `/setup unlock` (or button `jtb_unlock_polish`) loads persisted blueprint and runs polish-only apply.

## Architecture

### Apply modes

Extend `applyBlueprint(guild, blueprint, options)` with:

```js
options.mode = 'structure' | 'full' | 'polish'
```

| Mode | Runs |
|------|------|
| `structure` | Categories + channels **without** topics/webhooks; **skip** roles, `postMessages`, tickets, community |
| `full` | Current behavior (roles → channels w/ topics → messages → community → tickets) |
| `polish` | Roles (if missing) → update topics/perms as needed → `postMessages` → community → tickets; assumes structure may already exist |

Implementation detail: prefer stripping topics/webhooks in a `structure` blueprint transform rather than rewriting Discord channel creation twice — single `createChannels` path with `includeTopics: false` flag is acceptable.

### Entitlement helpers

Centralize in `entitlements.js` / setup gating:

- `hasUnconsumedBasicPack(interaction)` — `PREMIUM_SKU_ID`
- `hasGrandfatherFullLeft(guild)` — join date + `guildConfig.grandfatherFullBuildUsed !== true`
- `canApplyPolish(interaction, guild)` — pack OR grandfather OR `BOT_OWNER_ID`
- **Do not** check `SUBSCRIPTION_SKU_ID` for product gates (remove Pro from paywall copy and `isSubscriber` product paths)

Consume Basic pack only after successful `full` or `polish` apply (not after `structure`).

### Persistence

Per guild (`data/guilds/<id>.json` or existing store):

- Saved blueprint + interview answers (already largely present)
- `structureAppliedAt` / `polishAppliedAt`
- `grandfatherFullBuildUsed` (boolean)
- Stop relying on `earlyAdopterFreeBuildUsed` for new grants (migrate: if old flag used, treat as already consumed for grandfather too)

### Close loopholes

| Path | Change |
|------|--------|
| Onboarding `jtb_build` | Run interview → structure apply, or show paywall summary — **never** silent full apply |
| `/setup run` | Free interview + structure; polish gated |
| `/setup post-messages`, `ticket-panel`, `edit-message` | Require polish entitlement or prior successful polish on guild |
| `/setup edit-channel` | Optional: leave free for manual tweaks **or** gate topic/pin — **default leave free** for post-structure DIY |
| `/setup nuke` | Keep free (destructive utility; not a monetization feature) |

## Discord portal / marketing (manual + copy)

**Portal (human):** Set Basic Build Pack price to **$0.99**; update SKU description to match free+unlock story; retire/unlist Pro SKU when ready.

**In-bot + site copy:** Replace all `$3.99` / `$6.99/mo` / “Pro Builder” sales copy with:

- Free: interview + channel structure  
- $0.99: full customization from your answers (one pack = one full unlock)

Files likely touched: `setup.js` paywall strings, `bot.js` entitlement DMs, `index.html`, `docs/discord-expanded-description.md`, `env.example` comments.

## Error handling & ops

- Paywall shown with clear list of locked items + link/button to Discord store / bot profile SKUs  
- If polish requested without entitlement: ephemeral explain + store CTA; do not consume anything  
- If structure already applied and polish fails mid-way: leave structure; `postError` to ops; do not consume pack until polish succeeds  
- Ops analytics: log `structure_applied`, `polish_applied`, `pack_consumed`, `grandfather_used`

## Testing / success criteria

1. New guild (joined today): interview → structure only; polish blocked without pack.  
2. After purchasing Basic pack: polish applies from saved blueprint; entitlement consumed once.  
3. Guild with bot joined before 2026-07-11: one full apply without pack; second full/polish requires pack.  
4. Onboarding button never full-builds for free on new guilds.  
5. No user-facing Pro upsell remains.  
6. Discord portal SKU shows $0.99 (manual verify).

## Out of scope

- Stripe / Ko-fi  
- New Discord SKU ID (reuse Basic pack) unless Discord requires a new listing  
- Building real Community welcome-screen API beyond existing stub  
- App Discovery listing work (separate growth track)  
- Changing Royale / DAD monetization  

## Approach note

**Approach 1 (selected):** Interview free + structure free + $0.99 polish unlock; remove Pro; join-date grandfather.

Rejected alternatives:

- **Approach 2:** Soft tease only (no free structure) — rejected; user wants real free value.  
- **Approach 3:** Keep Pro for unlimited rebuilds — rejected; remove Pro.  
- **À la carte $1 micro-features** — deferred; single pack unlocks full polish.
