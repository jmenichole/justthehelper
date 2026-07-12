# JustTheHelper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship JustTheHelper as a new Discord app: free welcome/verify + optional post-verify DM + personal reminders; $1.99/mo guild subscription unlocks private-thread support tickets.

**Architecture:** Clone JustTheBuilder into a new repo, delete AI/blueprint/polish product code, keep Fly/ops/entitlement bones. Add focused modules for welcome, reminders, and thread tickets. Gate ticket flows with a guild subscription SKU check (bot owner bypass).

**Tech Stack:** Node.js ESM, discord.js v14, dotenv, Fly.io, JSON files under `data/`, `node:test` for unit tests.

**Spec:** `rumble2.0/docs/superpowers/specs/2026-07-12-justthehelper-design.md` (copy into Helper repo under `docs/superpowers/specs/` in Task 1).

**Working directory after Task 1:** `C:\Users\jmeni\Desktop\justthehelper` (new clone — never mutate production JustTheBuilder).

**Command shape (locked for this plan):** Top-level `/welcome`, `/tickets`, `/remind` (not nested under `/helper`).

**Manual (human, not automated):**
1. Create Discord Application **JustTheHelper** → Bot token, intents as needed (Guilds; Members if role grant requires it — prefer fetching member on interaction without GuildMembers intent when possible).
2. Create **guild subscription** SKU at **$1.99/mo**; put ID in `HELPER_SKU_ID`.
3. Create Fly app `justthehelper` (or similar); set secrets from `.env.example`.
4. Enable Discovery when ready; do not enable until smoke passes.

---

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | Rename to `justthehelper`; drop AI deps; add `test` script |
| `fly.toml` | App name `justthehelper` |
| `.env.example` | Token, owner, `HELPER_SKU_ID`, OPS_* channels |
| `src/utils/bot.js` | Client, command register, interaction router, reminder scanner start |
| `src/utils/entitlements.js` | `guildHasHelperSubscription`, owner bypass; remove Builder Pro/basic pack product API |
| `src/utils/storage/guildConfig.js` | Keep as-is |
| `src/utils/welcome/handler.js` | Post panel, verify button, optional DM after verify |
| `src/utils/commands/welcome.js` | `/welcome` slash data + handlers |
| `src/utils/reminders/store.js` | JSON CRUD for reminders |
| `src/utils/reminders/scanner.js` | Interval due → DM |
| `src/utils/commands/remind.js` | `/remind` slash |
| `src/utils/tickets/threads.js` | Private thread open / claim / close / one-per-user |
| `src/utils/commands/tickets.js` | `/tickets setup` + `/tickets panel` |
| `src/utils/ops.js` | Keep; set `ALERTS_BOT_ID=justthehelper` |
| `src/utils/events/guildCreate.js` | Install analytics only (no Builder onboarding DM) |
| Delete | `src/utils/ai/**`, `applyBlueprint.js`, `presets/**`, `onboarding/**`, `builder/**` (except if embedFactory reused — prefer delete and use EmbedBuilder inline), `commands/setup.js`, `earlyAdopters.js`, `grant.js` Builder flows (optional thin `/grant` for test entitlements later), AI scripts |

---

### Task 1: Bootstrap JustTheHelper repo

**Files:**
- Create directory: `C:\Users\jmeni\Desktop\justthehelper`
- Copy/adapt: all kept files from JustTheBuilder
- Create: `docs/superpowers/specs/2026-07-12-justthehelper-design.md` (copy from rumble2.0)
- Create: `docs/superpowers/plans/2026-07-12-justthehelper.md` (copy this plan)

- [ ] **Step 1: Clone without linking remotes to Builder production**

```powershell
cd C:\Users\jmeni\Desktop
git clone https://github.com/jmenichole/justthebuilder.git justthehelper
cd justthehelper
git remote rename origin builder-upstream
# Optional later: git remote add origin https://github.com/jmenichole/justthehelper.git
```

Expected: repo exists; `builder-upstream` points at Builder (read-only reference).

- [ ] **Step 2: Copy design + this plan into the new repo**

```powershell
New-Item -ItemType Directory -Force -Path docs\superpowers\specs, docs\superpowers\plans | Out-Null
Copy-Item C:\Users\jmeni\Desktop\rumble2.0\docs\superpowers\specs\2026-07-12-justthehelper-design.md docs\superpowers\specs\
Copy-Item C:\Users\jmeni\Desktop\rumble2.0\docs\superpowers\plans\2026-07-12-justthehelper.md docs\superpowers\plans\
```

- [ ] **Step 3: Commit bootstrap marker**

```bash
git add docs/superpowers
git commit -m "docs: import JustTheHelper design and implementation plan"
```

---

### Task 2: Strip Builder product + rename package

**Files:**
- Modify: `package.json`
- Modify: `fly.toml`
- Modify: `README.md`
- Delete: paths listed in file map
- Modify: `src/utils/bot.js` (temporary stub that still boots until later tasks wire commands)

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "justthehelper",
  "version": "1.0.0",
  "description": "Discord welcome, reminders, and paid private-thread tickets.",
  "main": "src/bot.js",
  "type": "module",
  "scripts": {
    "start": "node src/bot.js",
    "dev": "nodemon src/bot.js",
    "test": "node --test src/**/*.test.js"
  },
  "dependencies": {
    "discord.js": "^14.26.4",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

- [ ] **Step 2: Delete Builder-only trees**

```powershell
Remove-Item -Recurse -Force src\utils\ai, src\utils\builder, src\utils\onboarding, src\utils\presets -ErrorAction SilentlyContinue
Remove-Item -Force src\utils\applyBlueprint.js, src\utils\earlyAdopters.js, src\utils\commands\setup.js, src\utils\progress.js, src\utils\roles.js -ErrorAction SilentlyContinue
Remove-Item -Force scripts\runLocalBlueprint.js, scripts\simulate.js, scripts\validateJustthebuilderPreset.js, scripts\mergeTicketCategories.js -ErrorAction SilentlyContinue
```

Keep for now (rewrite in later tasks): `src/utils/tickets/**`, `src/utils/entitlements.js`, `src/utils/ops.js`, `src/utils/health.js`, `src/utils/logger.js`, `src/utils/storage/guildConfig.js`, `src/utils/events/guildCreate.js`, `src/utils/bot.js`.

- [ ] **Step 3: Point `fly.toml` at new app name**

```toml
app = 'justthehelper'
primary_region = 'iad'
```

(Leave build/http_service blocks unchanged.)

- [ ] **Step 4: Reinstall deps and commit**

```bash
npm install
git add -A
git commit -m "chore: rename to JustTheHelper and strip Builder AI/blueprint code"
```

---

### Task 3: Guild subscription entitlement helpers (TDD)

**Files:**
- Modify: `src/utils/entitlements.js`
- Create: `src/utils/entitlements.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBotOwner,
  guildHasHelperSubscriptionSync,
} from "./entitlements.js";

describe("entitlements", () => {
  it("owner is always allowed", () => {
    process.env.BOT_OWNER_ID = "owner1";
    assert.equal(isBotOwner("owner1"), true);
    assert.equal(isBotOwner("other"), false);
  });

  it("sync helper finds matching guild entitlement", () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    const ents = [{ skuId: "sku_helper", guildId: "g1" }];
    assert.equal(guildHasHelperSubscriptionSync("g1", ents), true);
    assert.equal(guildHasHelperSubscriptionSync("g2", ents), false);
  });

  it("returns false when SKU env missing", () => {
    delete process.env.HELPER_SKU_ID;
    delete process.env.SUBSCRIPTION_SKU_ID;
    assert.equal(guildHasHelperSubscriptionSync("g1", [{ skuId: "x", guildId: "g1" }]), false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```

Expected: FAIL (exports missing or wrong).

- [ ] **Step 3: Implement `src/utils/entitlements.js`**

```javascript
export function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return Boolean(ownerId && userId === ownerId);
}

function helperSkuId() {
  return process.env.HELPER_SKU_ID || process.env.SUBSCRIPTION_SKU_ID || "";
}

function asList(entitlements) {
  if (!entitlements) return [];
  return typeof entitlements.values === "function"
    ? [...entitlements.values()]
    : [...entitlements];
}

/** Pure check against an entitlement list (for tests + interaction.entitlements). */
export function guildHasHelperSubscriptionSync(guildId, entitlements) {
  const sku = helperSkuId();
  if (!sku || !guildId) return false;
  return asList(entitlements).some(
    (e) => e.skuId === sku && String(e.guildId) === String(guildId) && !e.consumed
  );
}

/**
 * True if guild may use tickets.
 * Owner bypass is for *user* actions in ticket admin flows — pass userId when checking commands.
 */
export async function canUseTickets(client, { guildId, userId, interactionEntitlements }) {
  if (userId && isBotOwner(userId)) return { allowed: true, reason: "owner" };
  if (guildHasHelperSubscriptionSync(guildId, interactionEntitlements)) {
    return { allowed: true, reason: "interaction" };
  }
  const sku = helperSkuId();
  if (!sku) return { allowed: false, reason: "sku_unconfigured" };
  try {
    const ents = await client.application.entitlements.fetch({
      guildId,
      excludeEnded: true,
      skuIds: [sku],
    });
    if (ents.some((e) => e.skuId === sku)) return { allowed: true, reason: "fetch" };
  } catch {
    return { allowed: false, reason: "fetch_failed" };
  }
  return { allowed: false, reason: "not_entitled" };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/entitlements.js src/utils/entitlements.test.js
git commit -m "feat: add guild Helper subscription entitlement checks"
```

---

### Task 4: Reminder store + scanner (TDD)

**Files:**
- Create: `src/utils/reminders/store.js`
- Create: `src/utils/reminders/store.test.js`
- Create: `src/utils/reminders/scanner.js`

- [ ] **Step 1: Failing tests for due selection**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { addReminder, listDueReminders, markReminder, REMINDERS_PATH } from "./store.js";

const tmp = path.resolve("data", "reminders.test.json");

describe("reminders store", () => {
  beforeEach(() => {
    process.env.REMINDERS_FILE = tmp;
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    delete process.env.REMINDERS_FILE;
  });

  it("lists only pending reminders that are due", () => {
    addReminder({ id: "a", userId: "u1", dueAt: Date.now() - 1000, text: "past", status: "pending" });
    addReminder({ id: "b", userId: "u1", dueAt: Date.now() + 60_000, text: "future", status: "pending" });
    const due = listDueReminders(Date.now());
    assert.equal(due.length, 1);
    assert.equal(due[0].id, "a");
  });

  it("markReminder updates status", () => {
    addReminder({ id: "c", userId: "u1", dueAt: Date.now() - 1, text: "x", status: "pending" });
    markReminder("c", "sent");
    assert.equal(listDueReminders(Date.now()).length, 0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node --test src/utils/reminders/store.test.js
```

- [ ] **Step 3: Implement store**

```javascript
import fs from "fs";
import path from "path";

function filePath() {
  return process.env.REMINDERS_FILE || path.resolve("data", "reminders.json");
}

function loadAll() {
  const p = filePath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function saveAll(rows) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(rows, null, 2));
}

export function addReminder(row) {
  const rows = loadAll();
  rows.push(row);
  saveAll(rows);
  return row;
}

export function listDueReminders(nowMs = Date.now()) {
  return loadAll().filter((r) => r.status === "pending" && r.dueAt <= nowMs);
}

export function markReminder(id, status) {
  const rows = loadAll();
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  rows[i] = { ...rows[i], status };
  saveAll(rows);
  return true;
}

export { filePath as REMINDERS_PATH };
```

- [ ] **Step 4: Implement scanner**

```javascript
import { listDueReminders, markReminder } from "./store.js";
import { log } from "../logger.js";

export function startReminderScanner(client, { intervalMs = 30_000 } = {}) {
  const tick = async () => {
    for (const r of listDueReminders()) {
      try {
        const user = await client.users.fetch(r.userId);
        await user.send(`⏰ Reminder: ${r.text}`);
        markReminder(r.id, "sent");
        log(`reminder_sent ${r.id}`);
      } catch (err) {
        markReminder(r.id, "failed");
        log(`reminder_failed ${r.id}: ${err.message}`);
      }
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}
```

- [ ] **Step 5: Run tests — PASS, then commit**

```bash
npm test
git add src/utils/reminders
git commit -m "feat: add reminder store and DM scanner"
```

---

### Task 5: `/remind` command

**Files:**
- Create: `src/utils/commands/remind.js`
- Modify: `src/utils/bot.js` (register + route — full wire in Task 8 if preferred; minimum: export command data now)

- [ ] **Step 1: Implement command**

```javascript
import {
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { randomUUID } from "crypto";
import { addReminder } from "../reminders/store.js";

/** Parse simple durations: 10m, 2h, 1d or ISO-ish epoch ms via digits. */
export function parseWhen(when, now = Date.now()) {
  const m = String(when).trim().match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days)$/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit.startsWith("m") ? 60_000 : unit.startsWith("h") ? 3_600_000 : 86_400_000;
    return now + n * mult;
  }
  const asNum = Number(when);
  if (Number.isFinite(asNum) && asNum > now) return asNum;
  return null;
}

export const RemindCommandData = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set a personal reminder (bot will DM you)")
  .addStringOption((o) =>
    o.setName("when").setDescription("e.g. 10m, 2h, 1d").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("text").setDescription("What to remind you about").setRequired(true).setMaxLength(500)
  )
  .toJSON();

export async function handleRemindCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "remind") return false;
  const whenRaw = interaction.options.getString("when", true);
  const text = interaction.options.getString("text", true);
  const dueAt = parseWhen(whenRaw);
  if (!dueAt) {
    await interaction.reply({
      content: "Could not parse `when`. Try `10m`, `2h`, or `1d`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const id = randomUUID();
  addReminder({
    id,
    userId: interaction.user.id,
    guildId: interaction.guildId || undefined,
    dueAt,
    text,
    status: "pending",
  });
  await interaction.reply({
    content: `Got it — I'll DM you <t:${Math.floor(dueAt / 1000)}:R>: ${text}`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
```

- [ ] **Step 2: Add parseWhen unit test**

```javascript
// src/utils/commands/remind.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWhen } from "./remind.js";

describe("parseWhen", () => {
  const now = 1_000_000;
  it("parses minutes", () => assert.equal(parseWhen("10m", now), now + 600_000));
  it("rejects garbage", () => assert.equal(parseWhen("tomorrow", now), null));
});
```

- [ ] **Step 3: Test + commit**

```bash
npm test
git add src/utils/commands/remind.js src/utils/commands/remind.test.js
git commit -m "feat: add /remind personal reminder command"
```

---

### Task 6: Welcome + verify + optional DM

**Files:**
- Create: `src/utils/welcome/handler.js`
- Create: `src/utils/commands/welcome.js`
- Create: `src/utils/welcome/handler.test.js` (pure helpers only)

- [ ] **Step 1: Button ID + config helpers**

```javascript
// src/utils/welcome/handler.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { log } from "../logger.js";

export const VERIFY_BUTTON_ID = "jth_verify";

export function buildWelcomePayload(cfg) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Welcome")
    .setDescription(cfg.welcomeEmbedText || "Click **Verify** to get access.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel("Verify").setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

export async function handleVerifyButton(interaction, client) {
  if (!interaction.isButton() || interaction.customId !== VERIFY_BUTTON_ID) return false;
  const cfg = loadGuildConfig(interaction.guildId);
  if (!cfg.verifyRoleId) {
    await interaction.reply({
      content: "Verify role is not configured. An admin must run `/welcome set-role`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(cfg.verifyRoleId);
  if (!role) {
    await interaction.reply({ content: "Configured verify role no longer exists.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!member.roles.cache.has(role.id)) {
    try {
      await member.roles.add(role, "JustTheHelper verify");
    } catch (err) {
      await interaction.reply({
        content: `Could not grant role (check bot role hierarchy / Manage Roles): ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
  }
  await interaction.reply({ content: "You're verified ✅", flags: MessageFlags.Ephemeral });
  if (cfg.welcomeDmEnabled && cfg.welcomeDmText) {
    try {
      await interaction.user.send(cfg.welcomeDmText.slice(0, 1800));
    } catch (err) {
      log(`welcome_dm_failed ${interaction.user.id}: ${err.message}`);
    }
  }
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({ event: "verify_success", guildId: interaction.guildId, userId: interaction.user.id });
  } catch {}
  return true;
}
```

- [ ] **Step 2: `/welcome` command module**

```javascript
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { buildWelcomePayload } from "../welcome/handler.js";

export const WelcomeCommandData = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Welcome message and verify button")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName("post").setDescription("Post welcome + Verify button in this channel"))
  .addSubcommand((s) =>
    s
      .setName("set-role")
      .setDescription("Role granted on Verify")
      .addRoleOption((o) => o.setName("role").setDescription("Member role").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("dm")
      .setDescription("Toggle DM after successful Verify")
      .addStringOption((o) =>
        o
          .setName("state")
          .setDescription("on or off")
          .setRequired(true)
          .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
      )
  )
  .addSubcommand((s) =>
    s
      .setName("set-dm")
      .setDescription("Text DMed after Verify when DM is on")
      .addStringOption((o) => o.setName("text").setDescription("DM body").setRequired(true).setMaxLength(1500))
  )
  .toJSON();

export async function handleWelcomeCommand(interaction, client) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "welcome") return false;
  const sub = interaction.options.getSubcommand();
  const cfg = loadGuildConfig(interaction.guildId);

  if (sub === "set-role") {
    const role = interaction.options.getRole("role", true);
    saveGuildConfig(interaction.guildId, { ...cfg, verifyRoleId: role.id });
    await interaction.reply({ content: `Verify role set to ${role}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "dm") {
    const on = interaction.options.getString("state", true) === "on";
    saveGuildConfig(interaction.guildId, { ...cfg, welcomeDmEnabled: on });
    await interaction.reply({ content: `Welcome DM after Verify: **${on ? "on" : "off"}**.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "set-dm") {
    const text = interaction.options.getString("text", true);
    saveGuildConfig(interaction.guildId, { ...cfg, welcomeDmText: text });
    await interaction.reply({ content: "Welcome DM text saved.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "post") {
    if (!cfg.verifyRoleId) {
      await interaction.reply({
        content: "Set a role first: `/welcome set-role`.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const payload = buildWelcomePayload(cfg);
    const msg = await interaction.channel.send(payload);
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      welcomeChannelId: interaction.channelId,
      welcomePanelMessageId: msg.id,
    });
    await interaction.reply({ content: "Welcome panel posted.", flags: MessageFlags.Ephemeral });
    try {
      const { postAnalytics } = await import("../ops.js");
      postAnalytics({ event: "welcome_posted", guildId: interaction.guildId });
    } catch {}
    return true;
  }
  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/welcome src/utils/commands/welcome.js
git commit -m "feat: add welcome panel, verify button, and optional post-verify DM"
```

---

### Task 7: Private-thread tickets (replace channel tickets)

**Files:**
- Replace: `src/utils/tickets/handler.js` → prefer rewrite as `src/utils/tickets/threads.js` + thin `handler.js` re-export
- Replace: `src/utils/tickets/config.js` (simplify — drop multi-category select for v1)
- Create: `src/utils/commands/tickets.js`
- Create: `src/utils/tickets/threads.test.js`

- [ ] **Step 1: Failing test — one open ticket per user**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findOpenTicketForUser } from "./threads.js";

describe("ticket open map", () => {
  it("finds existing open ticket for user", () => {
    const state = {
      counter: 2,
      open: {
        t1: { userId: "u1", createdAt: 1 },
        t2: { userId: "u2", createdAt: 2 },
      },
    };
    assert.equal(findOpenTicketForUser(state, "u1"), "t1");
    assert.equal(findOpenTicketForUser(state, "u3"), null);
  });
});
```

- [ ] **Step 2: Implement thread ticket core**

```javascript
// src/utils/tickets/threads.js
import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { canUseTickets } from "../entitlements.js";
import { log } from "../logger.js";

export const OPEN_ID = "jth_ticket_open";
export const CLAIM_ID = "jth_ticket_claim";
export const CLOSE_ID = "jth_ticket_close";

function ticketsPath(guildId) {
  const dir = path.resolve("data", "tickets");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${guildId}.json`);
}

export function loadTicketState(guildId) {
  const p = ticketsPath(guildId);
  if (!fs.existsSync(p)) return { counter: 0, open: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { counter: 0, open: {} };
  }
}

export function saveTicketState(guildId, state) {
  fs.writeFileSync(ticketsPath(guildId), JSON.stringify(state, null, 2));
}

export function findOpenTicketForUser(state, userId) {
  for (const [threadId, meta] of Object.entries(state.open || {})) {
    if (meta.userId === userId) return threadId;
  }
  return null;
}

export function buildTicketPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support tickets")
    .setDescription("Click below to open a private thread with staff.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(OPEN_ID).setLabel("Open ticket").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

function staffControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CLAIM_ID).setLabel("Claim").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CLOSE_ID).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

export async function handleTicketInteraction(interaction, client) {
  if (interaction.isButton() && interaction.customId === OPEN_ID) {
    return openTicket(interaction, client);
  }
  if (interaction.isButton() && interaction.customId === CLAIM_ID) {
    return claimTicket(interaction);
  }
  if (interaction.isButton() && interaction.customId === CLOSE_ID) {
    return closeTicket(interaction);
  }
  return false;
}

async function denyPaywall(interaction) {
  await interaction.reply({
    content:
      "Tickets require **JustTheHelper** ($1.99/mo) for this server. An admin can subscribe in the app's store / SKU page.",
    flags: MessageFlags.Ephemeral,
  });
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({ event: "unlock_denied", guildId: interaction.guildId, userId: interaction.user.id });
  } catch {}
}

async function openTicket(interaction, client) {
  // Guild entitlement only (no owner bypass on open — members must be on a paying server).
  const guildGate = await canUseTickets(client, {
    guildId: interaction.guildId,
    userId: null,
    interactionEntitlements: interaction.entitlements,
  });
  if (!guildGate.allowed) {
    await denyPaywall(interaction);
    return true;
  }

  const cfg = loadGuildConfig(interaction.guildId);
  const parentId = cfg.ticketParentChannelId || interaction.channelId;
  const parent = await interaction.guild.channels.fetch(parentId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Ticket parent must be a text channel. Run `/tickets setup`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const state = loadTicketState(interaction.guildId);
  const existing = findOpenTicketForUser(state, interaction.user.id);
  if (existing) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing}>`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  state.counter += 1;
  const num = state.counter;
  const name = `ticket-${num}-${(interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;

  let thread;
  try {
    thread = await parent.threads.create({
      name: name.slice(0, 100),
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "JustTheHelper ticket",
    });
    await thread.members.add(interaction.user.id);
    for (const roleId of cfg.staffRoleIds || []) {
      // Staff join by seeing mention + having access via role overwrites on parent; invite staff users optionally later.
    }
  } catch (err) {
    await interaction.editReply({
      content: `Could not create private thread (need Create Private Threads): ${err.message}`,
    });
    return true;
  }

  state.open[thread.id] = { userId: interaction.user.id, createdAt: Date.now() };
  saveTicketState(interaction.guildId, state);

  const staffMentions = (cfg.staffRoleIds || []).map((id) => `<@&${id}>`).join(" ");
  await thread.send({
    content: `${staffMentions}\nTicket from <@${interaction.user.id}>`.trim(),
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Ticket #${num}`)
        .setDescription("Staff can Claim or Close below."),
    ],
    components: [staffControls()],
  });

  await interaction.editReply({ content: `Opened ${thread}` });
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({ event: "ticket_opened", guildId: interaction.guildId, userId: interaction.user.id });
  } catch {}
  return true;
}

async function claimTicket(interaction) {
  const state = loadTicketState(interaction.guildId);
  const meta = state.open[interaction.channelId];
  if (!meta) {
    await interaction.reply({ content: "Not an open Helper ticket.", flags: MessageFlags.Ephemeral });
    return true;
  }
  meta.claimedBy = interaction.user.id;
  saveTicketState(interaction.guildId, state);
  await interaction.reply({ content: `Claimed by <@${interaction.user.id}>` });
  return true;
}

async function closeTicket(interaction) {
  const state = loadTicketState(interaction.guildId);
  if (!state.open[interaction.channelId]) {
    await interaction.reply({ content: "Not an open Helper ticket.", flags: MessageFlags.Ephemeral });
    return true;
  }
  delete state.open[interaction.channelId];
  saveTicketState(interaction.guildId, state);
  await interaction.reply({ content: "Ticket closed." });
  try {
    await interaction.channel.setArchived(true);
  } catch (err) {
    log(`ticket_archive_failed: ${err.message}`);
  }
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({ event: "ticket_closed", guildId: interaction.guildId, userId: interaction.user.id });
  } catch {}
  return true;
}
```

**Note:** Ticket **open** requires guild entitlement only. Owner bypass applies to `/tickets setup` and `/tickets panel` via `userId` in `canUseTickets`.

- [ ] **Step 3: `/tickets` commands**

```javascript
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { canUseTickets } from "../entitlements.js";
import { buildTicketPanelPayload } from "../tickets/threads.js";

export const TicketsCommandData = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("Paid support tickets (private threads)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("setup")
      .setDescription("Configure ticket parent channel and staff role")
      .addChannelOption((o) => o.setName("channel").setDescription("Parent text channel").setRequired(true))
      .addRoleOption((o) => o.setName("staff_role").setDescription("Staff role to ping").setRequired(true))
  )
  .addSubcommand((s) => s.setName("panel").setDescription("Post the Open ticket panel here"))
  .toJSON();

export async function handleTicketsCommand(interaction, client) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "tickets") return false;
  const access = await canUseTickets(client, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    interactionEntitlements: interaction.entitlements,
  });
  if (!access.allowed) {
    await interaction.reply({
      content: "This server needs JustTheHelper **$1.99/mo** to use tickets (or you must be the bot owner for testing).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const cfg = loadGuildConfig(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const role = interaction.options.getRole("staff_role", true);
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      ticketParentChannelId: channel.id,
      staffRoleIds: [role.id],
    });
    await interaction.reply({ content: `Tickets parent ${channel}, staff ${role}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "panel") {
    const msg = await interaction.channel.send(buildTicketPanelPayload());
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      ticketPanelChannelId: interaction.channelId,
      ticketPanelMessageId: msg.id,
    });
    await interaction.reply({ content: "Ticket panel posted.", flags: MessageFlags.Ephemeral });
    try {
      const { postAnalytics } = await import("../ops.js");
      postAnalytics({ event: "ticket_panel_posted", guildId: interaction.guildId });
    } catch {}
    return true;
  }
  return true;
}
```

- [ ] **Step 4: Delete old channel-ticket logic**

Remove category select / `GuildText` channel creation from leftover `handler.js`. Make `handler.js` re-export `handleTicketInteraction` from `threads.js` **or** update all imports to `threads.js` and delete old handler.

- [ ] **Step 5: Test + commit**

```bash
npm test
git add src/utils/tickets src/utils/commands/tickets.js
git commit -m "feat: private-thread tickets gated by guild subscription"
```

---

### Task 8: Wire `bot.js` — commands, interactions, scanner, install

**Files:**
- Modify: `src/utils/bot.js`
- Modify: `src/utils/events/guildCreate.js`
- Modify: `src/utils/ops.js` default `ALERTS_BOT_ID` comment / env example

- [ ] **Step 1: Replace command registration body**

```javascript
const { WelcomeCommandData, handleWelcomeCommand } = await import("./commands/welcome.js");
const { TicketsCommandData, handleTicketsCommand } = await import("./commands/tickets.js");
const { RemindCommandData, handleRemindCommand } = await import("./commands/remind.js");
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(client.user.id), {
  body: [WelcomeCommandData, TicketsCommandData, RemindCommandData],
});
log("Registered /welcome /tickets /remind");
```

- [ ] **Step 2: Start reminder scanner on ready**

```javascript
const { startReminderScanner } = await import("./reminders/scanner.js");
startReminderScanner(client);
```

- [ ] **Step 3: Interaction router**

```javascript
client.on("interactionCreate", async (i) => {
  try {
    if (await handleWelcomeCommand(i, client)) return;
    if (await handleTicketsCommand(i, client)) return;
    if (await handleRemindCommand(i)) return;
    const { handleVerifyButton } = await import("./welcome/handler.js");
    if (await handleVerifyButton(i, client)) return;
    const { handleTicketInteraction } = await import("./tickets/threads.js");
    if (await handleTicketInteraction(i, client)) return;
  } catch (err) {
    log(`Interaction error: ${err.message}`);
    const { postError } = await import("./ops.js");
    postError({ context: "interactionCreate", error: err, guildId: i.guildId, userId: i.user?.id });
  }
});
```

- [ ] **Step 4: Slim `guildCreate`**

Post `guild_install` analytics only; **do not** DM Builder onboarding.

- [ ] **Step 5: Remove GROQ env warning from `assertEnv`; keep DISCORD_TOKEN check**

- [ ] **Step 6: Retarget entitlementCreate handler** to Helper SKU label `"JustTheHelper $1.99/mo"` and `postPurchase`

- [ ] **Step 7: Commit**

```bash
git add src/utils/bot.js src/utils/events/guildCreate.js
git commit -m "feat: wire Helper commands, verify/tickets buttons, reminder scanner"
```

---

### Task 9: Env example, README, privacy/terms skim, ops bot id

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Modify: `privacy.md` / `terms.md` (replace Builder product claims)
- Modify: Dockerfile only if it references Builder paths (usually fine)

- [ ] **Step 1: `.env.example`**

```env
DISCORD_TOKEN=
BOT_OWNER_ID=1153034319271559328
HELPER_SKU_ID=
ALERTS_BOT_ID=justthehelper
OPS_GUILD_ID=
OPS_ERROR_CHANNEL_ID=
OPS_ANALYTICS_CHANNEL_ID=
OPS_SUPPORT_CHANNEL_ID=
OPS_ALERT_USER_ID=1153034319271559328
PORT=3000
```

- [ ] **Step 2: README** — install, commands table matching spec, freemium split, link to design doc

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md privacy.md terms.md
git commit -m "docs: JustTheHelper README and env example"
```

---

### Task 10: Deploy checklist + smoke

**Files:** none required (ops)

- [ ] **Step 1: Human — Discord application + $1.99 guild SKU + invite URL with `applications.commands` + bot scopes; permissions: Manage Roles, Send Messages, Create Private Threads, Manage Threads, Embed Links**

- [ ] **Step 2: Fly**

```bash
fly apps create justthehelper
fly secrets set DISCORD_TOKEN=... BOT_OWNER_ID=... HELPER_SKU_ID=... OPS_GUILD_ID=... OPS_ERROR_CHANNEL_ID=... OPS_ANALYTICS_CHANNEL_ID=... OPS_SUPPORT_CHANNEL_ID=...
fly deploy
curl https://justthehelper.fly.dev/health
```

Expected: `{"status":"ok",...}` (or existing health JSON shape).

- [ ] **Step 3: Manual smoke**

1. Invite bot → analytics `guild_install`
2. `/welcome set-role` → `/welcome post` → Verify → role granted
3. `/welcome set-dm` + `/welcome dm on` → Verify again (or remove role first) → DM received or silent fail if closed
4. `/remind when:1m text:ping` → DM within ~1–2 minutes
5. Without SKU: `/tickets panel` denied
6. With test entitlement or owner: `/tickets setup` → `/tickets panel` → Open → Claim → Close
7. Confirm no `/setup`, no Groq, no Builder strings in replies

- [ ] **Step 4: Commit any smoke fixes; tag `v0.1.0` optional**

```bash
git commit -m "fix: smoke-test follow-ups for JustTheHelper v0.1"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Bootstrap gut JTB | 1–2 |
| Free welcome + verify | 6, 8 |
| Optional DM after Verify (default off) | 6 |
| `/remind` personal + scanner | 4–5, 8 |
| No mod tools | 2 (deleted), 8 (not registered) |
| $1.99 guild SKU gate tickets | 3, 7 |
| Private threads + claim/close | 7 |
| One open ticket per user | 7 |
| Ops analytics events | 6–8 |
| Fly + health | 2, 10 |
| Unit tests entitlement/remind/tickets | 3–5, 7 |

## Placeholder / consistency review

- Command shape locked: `/welcome`, `/tickets`, `/remind`.
- SKU env: `HELPER_SKU_ID` (fallback `SUBSCRIPTION_SKU_ID`).
- Ticket **open** uses guild entitlement only; **setup/panel** allow bot-owner bypass via `canUseTickets(..., userId)`.
