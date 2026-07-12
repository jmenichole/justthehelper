# JustTheHelper Design

**Date:** 2026-07-12  
**Status:** Approved — implementation plan written  
**Product:** JustTheHelper (Discord app)  
**Bootstrap:** Strip-and-swap from JustTheBuilder (new repo / Discord application / Fly app)

## Summary

JustTheHelper is a thin Discovery utility: free welcome + verify, optional welcome DM, personal reminders, and a **$1.99/mo guild subscription** that unlocks support tickets as private threads. No moderation suite (warns, kicks, infractions, automod) in v1.

## Goals

- Ship a complete, installable free surface quickly by gutting JustTheBuilder bones (discord.js, Fly, health, ops analytics, entitlement plumbing, guild JSON config).
- Monetize one clear paid job: staff support tickets.
- Stay Discovery-safe and category-honest (Utilities / Moderation and Tools adjacent) without competing as a Dyno clone.

## Non-goals (v1)

- Moderation tools (warn, timeout, kick, ban, infractions, automod)
- Rules-card UI / multi-button verify quizzes
- Ticket transcripts, multi-category panels, channel-based tickets
- Discord Activities
- Consumable SKUs or user-paid “open a ticket” charges
- AI / blueprint / server-builder features from JustTheBuilder

## Freemium split

| Tier | Features |
|------|----------|
| **Free** | Welcome embed + one Verify button → one role; optional welcome DM (default **off**); `/remind` personal reminders |
| **$1.99/mo guild subscription** | Ticket panel; open private thread; claim / close |

Subscription is **guild-level**: an admin pays so the server can run tickets. Members do not pay to open a ticket. Bot owner always bypasses the ticket gate for testing.

## Bootstrap approach

1. Clone JustTheBuilder into a new **JustTheHelper** repository (do not mutate production Builder).
2. **Keep:** client bootstrap, slash registration, Fly + `/health`, ops analytics hooks, entitlement event wiring, `guildConfig`-style JSON storage, logger.
3. **Delete:** AI interview, blueprint apply, polish unlock, Builder presets, consumable Basic Build Pack flows, Builder-specific onboarding copy.
4. **Rewrite:** welcome/verify, reminders, tickets as **private threads** (do not ship JTB’s private-channel ticket opener unchanged), retarget SKU env to Helper guild subscription.

## Commands (v1)

### Free

| Command | Behavior |
|---------|----------|
| `/welcome post` | Posts welcome embed + Verify button in the current (or chosen) channel. Requires Manage Guild / Manage Roles as appropriate. |
| `/welcome set-role` | Sets the role granted on Verify (bot must be above role, have Manage Roles). |
| `/welcome dm on\|off` | Toggles DM of a short blurb **after successful Verify** (default **off**). |
| `/welcome set-dm` | Sets DM blurb text (length-capped). |
| `/remind <when> <text>` | Schedules a personal reminder; bot DMs the user at due time. |

### Paid (guild subscription required)

| Command / control | Behavior |
|-------------------|----------|
| `/tickets setup` | Sets parent text channel for ticket threads + staff role(s). |
| `/tickets panel` | Posts panel with Open Ticket button in a channel. Denied with ephemeral upgrade CTA if guild not entitled. |
| Open Ticket button | Creates a **private thread** under the panel’s channel (or configured parent); records opener; pings staff roles. |
| Claim / Close buttons | In-thread staff controls; close archives/locks thread per Discord thread APIs. |

Exact slash names may be nested under `/helper` during implementation if Discord command limits prefer grouping; behavior above is normative.

## Welcome & verify

1. Admin runs `/welcome set-role` then `/welcome post`.
2. Member clicks **Verify** → bot grants configured role (idempotent if already has role).
3. If welcome DM is **on**, bot attempts DM with configured blurb **after successful Verify**. Failures (privacy, closed DMs) are logged and skipped — no public error spam.
4. No captcha, no multi-step gate, no rule-break warnings.

## Reminders

- Storage: JSON list of `{ id, userId, dueAt, text }` (guildId optional for context).
- Background scanner (interval, similar to JTB stale-funnel pattern) fires due reminders via DM.
- Failed DM: mark reminder failed/complete and log; do not retry forever.
- v1 is **personal** only (no channel announcements, no “remind @role”).

## Tickets (private threads)

1. Guild must have active Helper subscription entitlement (or bot-owner bypass).
2. Admin configures parent channel + staff roles, posts panel.
3. Member opens ticket → private thread named with short slug + counter; opener + staff can view; others cannot.
4. Staff may **Claim** (record claimedBy, optional rename/tag in embed) and **Close** (archive/lock, clear from open map).
5. One open ticket per user per guild in v1 (re-open blocked with ephemeral pointer to existing thread).

## Data model

### Guild config

```text
welcomeChannelId?
welcomeEmbedText?
verifyRoleId?
welcomeDmEnabled: boolean (default false)
welcomeDmText?
ticketParentChannelId?
ticketPanelChannelId?
ticketPanelMessageId?
staffRoleIds: string[]
```

### Ticket state (per guild)

```text
counter: number
open: { [threadId]: { userId, claimedBy?, createdAt } }
```

### Reminders

```text
{ id, userId, dueAt, text, status?: pending|sent|failed }
```

## Billing

- One Discord **guild subscription** SKU priced **$1.99/mo** (ID set via env, e.g. `HELPER_SKU_ID` / `SUBSCRIPTION_SKU_ID`).
- Ticket setup/panel/open check guild entitlement via Discord entitlements API (and interaction entitlements when present).
- Free commands never require the SKU.
- Ops: reuse purchase/entitlement logging pattern from JustTheBuilder, labeled for Helper.

## Errors & edge cases

| Case | Behavior |
|------|----------|
| No subscription on ticket action | Ephemeral message + Discord store / SKU CTA |
| Verify role missing / hierarchy | Ephemeral admin-facing error |
| Welcome DM fails | Silent skip + log |
| Reminder DM fails | Mark failed + log |
| Duplicate open ticket | Ephemeral link/mention of existing thread |
| Bot lacks Create Private Threads / Manage Threads | Ephemeral setup error explaining required perms |

## Analytics (ops)

Reuse shared ops channel pattern where possible:

- `guild_install`
- `welcome_posted` / `verify_success`
- `reminder_scheduled` / `reminder_sent`
- `ticket_panel_posted` / `ticket_opened` / `ticket_closed`
- `unlock_denied` (ticket gated)
- `purchase` / entitlement create for Helper SKU

## Testing (v1)

- Unit: entitlement gate allow/deny; reminder due selection; ticket open-map one-per-user.
- Manual smoke: install → welcome post → verify → optional DM; `/remind` short delay; purchase/test entitlement → panel → open thread → claim → close; deny path without entitlement.

## Open implementation notes (not product blockers)

- Prefer grouping under `/helper` vs top-level `/welcome` `/tickets` `/remind` — choose at plan time for UX clarity.
- Welcome DM trigger is fixed: **after successful Verify**.
- SKU must be created in Discord Developer Portal for the new application before production paywall.

## Success criteria

- New guild can complete free welcome+verify in under 5 minutes.
- Paying guild can post a panel and run a full open → claim → close thread ticket flow.
- No Builder AI/blueprint strings remain in user-facing copy.
- Moderation commands are absent from the command list.
