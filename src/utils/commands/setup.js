import { runInterview } from "../ai/interviewFlow.js";
import { log } from "../logger.js";
import { applyBlueprint } from "../applyBlueprint.js";
import { postMessagesToExistingChannels } from "../builder/messages.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  PermissionFlagsBits
} from "discord.js";

// In-memory cooldown stores
const serverCooldowns = new Map(); // guildId -> timestamp
const userCooldowns = new Map(); // userId -> timestamp

const SERVER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const USER_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Slash command definition for /setup with all subcommands.
 * @type {object}
 */
export const SetupCommandData = {
  name: "setup",
  description: "Build or manage your server with JustTheBuilder.",
  options: [
    { 
      type: 1, 
      name: "run", 
      description: "Run the automated server builder",
      options: [
        {
          type: 3,
          name: "preset",
          description: "⚡ Fast-track with a preset (Premium)",
          required: false,
          choices: [
            { name: "🎮 Gaming Community", value: "gaming" },
            { name: "💎 Crypto/Web3", value: "crypto" },
            { name: "🎥 Content Creator", value: "content" },
            { name: "💼 Professional", value: "professional" },
            { name: "🛡️ Support Server", value: "support" },
            { name: "💎 JustTheBuilder Support Server", value: "justthebuilder" }
          ]
        }
      ]
    },
    { type: 1, name: "nuke", description: "☢️ Backup to DM, then delete ALL channels (DANGEROUS)" },
    {
      type: 1,
      name: "post-messages",
      description: "Post rules/about/FAQ embeds into existing channels"
    },
    {
      type: 1,
      name: "ticket-panel",
      description: "Post the support ticket category menu in #create-ticket"
    },
    {
      type: 1,
      name: "edit-channel",
      description: "Set channel topic or pin/unpin a message",
      options: [
        { type: 7, name: 'channel', description: 'The channel to edit', required: true },
        { type: 3, name: 'topic', description: 'New topic/description for the channel', required: false },
        { type: 3, name: 'pin-message', description: 'Message ID to pin in the channel', required: false },
        { type: 3, name: 'unpin-message', description: 'Message ID to unpin from the channel', required: false }
      ] 
    },
    {
      type: 1,
      name: "edit-message",
      description: "💎 Edit a bot message/embed (Premium)",
      options: [
        { type: 7, name: 'channel', description: 'Channel containing the message', required: true },
        { type: 3, name: 'message_id', description: 'ID of the message to edit', required: true },
        { type: 3, name: 'title', description: 'New embed title', required: false },
        { type: 3, name: 'body', description: 'New embed body text', required: false }
      ]
    }
  ]
};

/**
 * Ephemeral confirm via buttons (reactions do not work on ephemeral messages).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{ title: string, detail?: string }} opts
 * @returns {Promise<boolean>}
 */
async function confirmDestructive(interaction, { title, detail = "" }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_confirm_yes")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("setup_confirm_no")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    ephemeral: true,
    content: `⚠️ **${title}**\n${detail}\n\nPress **Confirm** within 30 seconds, or **Cancel**.`,
    components: [row]
  });

  try {
    const msg = await interaction.fetchReply();
    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        (i.customId === "setup_confirm_yes" || i.customId === "setup_confirm_no"),
      time: 30_000
    });
    const ok = btn.customId === "setup_confirm_yes";
    await btn.update({
      content: ok ? "✅ Confirmed. Working…" : "❌ Cancelled.",
      components: []
    });
    return ok;
  } catch {
    try {
      await interaction.editReply({ content: "⏱️ Timed out — cancelled.", components: [] });
    } catch {}
    return false;
  }
}

/**
 * Delete all channels in the guild (roles left intact to avoid lockout).
 * @param {import('discord.js').Guild} guild
 */
async function wipeServer(guild) {
  // Danger: simplistic wipe of channels (not roles to avoid lockout)
  for (const channel of guild.channels.cache.values()) {
    try { await channel.delete("Setup reset"); } catch {}
  }
}

/**
 * Handle /setup interactions with cooldowns and confirmations.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
/**
 * Entry handler for /setup command interactions, performing cooldown checks
 * and dispatching subcommands.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleSetupInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "setup") return;
  if (!interaction.guild) {
    return interaction.reply({ ephemeral: true, content: "This command only works in a server." }).catch(() => {});
  }

  const owner = await interaction.guild.fetchOwner();
  if (interaction.user.id !== owner.id) {
    return interaction.reply({ ephemeral: true, content: "Owner only." });
  }

  const sub = interaction.options.getSubcommand();

  // --- Entitlement Check ---
  // PREMIUM_SKU_ID     = Basic Build Pack ($3.99 consumable, one build)
  // SUBSCRIPTION_SKU_ID = Pro Builder ($6.99/mo, unlimited builds)
  const basicPackSkuId = process.env.PREMIUM_SKU_ID;
  const subSkuId = process.env.SUBSCRIPTION_SKU_ID;

  const activeEntitlements = interaction.entitlements;
  const hasSub = subSkuId
    ? activeEntitlements.some(e => e.skuId === subSkuId)
    : false;
  const basicPackEntitlement = basicPackSkuId
    ? activeEntitlements.find(e => e.skuId === basicPackSkuId && !e.consumed)
    : null;
  const hasBasicPack = !!basicPackEntitlement;

  // Check if early adopter bypass is active
  let isEarlyAdopter = false;
  let hasFreeBuildLeft = false;
  const earlyAdoptersPath = path.resolve('data', 'early_adopters.json');
  if (fs.existsSync(earlyAdoptersPath)) {
    try {
      const adopters = JSON.parse(fs.readFileSync(earlyAdoptersPath, 'utf-8'));
      if (Array.isArray(adopters) && adopters.includes(interaction.guild.id)) {
        isEarlyAdopter = true;
        const cfg = loadGuildConfig(interaction.guild.id);
        if (!cfg.earlyAdopterFreeBuildUsed) {
          hasFreeBuildLeft = true;
        }
      }
    } catch {}
  }

  // isPremium = has subscription OR has unconsumed basic build pack OR has early adopter free build left
  const isPremium = hasSub || hasBasicPack || hasFreeBuildLeft;
  // isSubscriber = recurring sub only (unlocks presets)
  const isSubscriber = hasSub;

  const isOwner = process.env.BOT_OWNER_ID && interaction.user.id === process.env.BOT_OWNER_ID;

  if (sub === "run") {
    const preset = interaction.options.getString("preset");

    // Presets require a subscription (not just a one-time pack), except for the bot owner or the free support preset
    if (preset && preset !== "justthebuilder" && preset !== "justthetip" && !isSubscriber && !isOwner) {
      return interaction.reply({
        ephemeral: true,
        content: [
          "⚡ **Fast-Track Presets are a Pro Builder feature.**",
          "Subscribe for $6.99/mo for unlimited rebuilds + all presets.",
          "",
          "Or run `/setup run` (no preset) with a **Basic Build Pack** ($3.99 one-time) for a fully AI-customized build.",
          "",
          "👉 Check my bot profile to upgrade!"
        ].join("\n")
      });
    }

    // Core /setup run requires EITHER a subscription, basic pack, unused early adopter free build, or being the bot owner
    if (!isPremium && !isOwner) {
      const message = [
        "🔒 **You need a pack to run the server builder.**",
        "",
        "**Basic Build Pack** — $3.99 (one complete server setup)",
        "**Pro Builder** — $6.99/mo (unlimited rebuilds + presets)",
        ""
      ];
      if (isEarlyAdopter) {
        message.push("⚠️ *Note: Your Early Adopter free build has already been used for this server.*", "");
      }
      message.push("👉 Check my bot profile to get started!");
      return interaction.reply({
        ephemeral: true,
        content: message.join("\n")
      });
    }

    // Check cooldowns
    const now = Date.now();
    const serverLast = serverCooldowns.get(interaction.guild.id) || 0;
    const userLast = userCooldowns.get(interaction.user.id) || 0;
    if (now - serverLast < SERVER_COOLDOWN_MS && !isOwner) {
      const wait = (((SERVER_COOLDOWN_MS - (now - serverLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Server cooldown active. Try again in ${wait}s.` });
    }
    if (now - userLast < USER_COOLDOWN_MS && !isOwner) {
      const wait = (((USER_COOLDOWN_MS - (now - userLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Your personal cooldown active. Try again in ${wait}s.` });
    }
    serverCooldowns.set(interaction.guild.id, now);
    userCooldowns.set(interaction.user.id, now);
    await interaction.reply({ ephemeral: true, content: preset ? `🚀 Launching **${preset}** quick-setup...` : "Launching interview..." });
    try {
      if (!preset) {
        try {
          await owner.send("Re-running server setup interview.");
        } catch (dmErr) {
          log(`DM to owner failed: ${dmErr.message}`);
          await interaction.followUp({ ephemeral: true, content: "⚠️ Could not DM you — please enable DMs from server members and try again." });
          return;
        }
      }
      const buildSuccess = await runInterview(owner.user, interaction.guild, client, preset, isPremium || isOwner);
      // Consume the entitlement or early adopter free build after a successful build
      if (buildSuccess && !isOwner) {
        if (hasBasicPack && basicPackEntitlement) {
          try {
            await interaction.client.application.consumeEntitlement(basicPackEntitlement.id);
            log(`Consumed entitlement ${basicPackEntitlement.id} for user ${interaction.user.id}`);
          } catch (consumeErr) {
            log(`Failed to consume entitlement: ${consumeErr.message}`);
          }
        } else if (!hasSub && hasFreeBuildLeft) {
          try {
            const cfg = loadGuildConfig(interaction.guild.id);
            saveGuildConfig(interaction.guild.id, { ...cfg, earlyAdopterFreeBuildUsed: true });
            log(`Marked early adopter free build as used for guild ${interaction.guild.id}`);
          } catch (saveErr) {
            log(`Failed to save early adopter status: ${saveErr.message}`);
          }
        }
      }
    } catch (err) {
      log(`runInterview error: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Something went wrong during setup: ${err.message}` });
    }
  } else if (sub === "nuke") {
    const confirmed = await confirmDestructive(interaction, {
      title: "Delete ALL channels?",
      detail:
        "A JSON backup will be sent to your DMs first. Roles are kept so you are not locked out. Then run `/setup run` to rebuild."
    });
    if (!confirmed) return;

    await interaction.followUp({ ephemeral: true, content: "📦 Creating safety backup before nuke..." });
    
    try {
      const data = await exportGuild(interaction.guild);
      const backupDir = path.resolve('data', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filePath = path.join(backupDir, `nuke-${interaction.guild.id}-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      await interaction.user.send({
        content: `☢️ **Nuke Safety Backup**\nHere is the server state before the nuke command was executed.`,
        files: [ filePath ]
      });
      await interaction.followUp({ ephemeral: true, content: "✅ Backup secured in DMs." });
    } catch (err) {
      log(`Nuke backup failed: ${err.message}`);
      return interaction.followUp({ ephemeral: true, content: `❌ Backup failed (${err.message}). Nuke aborted for safety.` });
    }

    await interaction.followUp({ ephemeral: true, content: "☢️ **NUKING CHANNELS**..." });
    await wipeServer(interaction.guild);
    await interaction.followUp({
      ephemeral: true,
      content: "💀 Nuke complete. Run `/setup run preset:justthebuilder` to rebuild your support layout."
    });
  } else if (sub === "post-messages") {
    const filePath = path.resolve("data", "blueprints", `${interaction.guild.id}.json`);
    const cfg = loadGuildConfig(interaction.guild.id);
    const bp = cfg.lastBlueprint || (fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : null);
    if (!bp) {
      return interaction.reply({
        ephemeral: true,
        content: "No blueprint found. Run `/setup run` first."
      });
    }
    await interaction.reply({ ephemeral: true, content: "Posting embeds into existing channels…" });
    try {
      const results = await postMessagesToExistingChannels(interaction.guild, bp, interaction.user);
      const summary =
        results.posted.length > 0
          ? `✅ Posted ${results.posted.length} embed(s)${results.pinned.length ? `, pinned ${results.pinned.length}` : ""}.`
          : "No embeds were posted.";
      const failNote = results.failed.length ? `\n⚠️ Failed: ${results.failed.join("; ")}` : "";
      await interaction.followUp({ ephemeral: true, content: summary + failNote });
    } catch (err) {
      log(`post-messages failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Failed: ${err.message}` });
    }
  } else if (sub === "ticket-panel") {
    await interaction.reply({ ephemeral: true, content: "Posting support ticket panel…" });
    try {
      const { getTicketConfig, saveTicketConfig, buildTicketsConfigFromInterview } = await import(
        "../tickets/config.js"
      );
      const { deployTicketPanelInGuild } = await import("../tickets/handler.js");
      let config = getTicketConfig(interaction.guild.id);
      if (!config) {
        const bpPath = path.resolve("data", "blueprints", `${interaction.guild.id}.json`);
        if (fs.existsSync(bpPath)) {
          const bp = JSON.parse(fs.readFileSync(bpPath, "utf-8"));
          config = bp.tickets;
        }
      }
      if (!config?.enabled) {
        config = buildTicketsConfigFromInterview(
          ["", "", "", "", "", "", "Admin, Moderator", "", "", "yes", ""],
          (await import("../ai/interviewConfig.js")).A
        );
        saveTicketConfig(interaction.guild.id, config, null);
      }
      const ok = config?.enabled && (await deployTicketPanelInGuild(interaction.guild, client));
      await interaction.followUp({
        ephemeral: true,
        content: ok
          ? "✅ Ticket panel is live — **anyone** can pick a category and open a ticket. Staff roles are pinged automatically."
          : "❌ No ticket channel found. Run `/setup run` with tickets enabled, or create `#create-ticket`."
      });
    } catch (err) {
      log(`ticket-panel failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Failed: ${err.message}` });
    }
  } else if (sub === 'edit-channel') {
    const channel = interaction.options.getChannel('channel');
    const topic = interaction.options.getString('topic');
    const pinMessageId = interaction.options.getString('pin-message');
    const unpinMessageId = interaction.options.getString('unpin-message');

    if (!topic && !pinMessageId && !unpinMessageId) {
      return interaction.reply({ ephemeral: true, content: 'Please provide at least one option: topic, pin-message, or unpin-message.' });
    }

    await interaction.reply({ ephemeral: true, content: 'Processing channel edit…' });
    const results = [];

    // Edit channel topic/description
    if (topic) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Topic can only be set on text-based channels.');
        } else {
          await channel.setTopic(topic);
          results.push(`✅ Topic updated to: "${topic}"`);
        }
      } catch (err) {
        log(`Edit channel topic failed: ${err.message}`);
        results.push(`❌ Failed to update topic: ${err.message}`);
      }
    }

    // Pin a message
    if (pinMessageId) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Can only pin messages in text-based channels.');
        } else {
          const message = await channel.messages.fetch(pinMessageId);
          await message.pin();
          results.push(`📌 Message ${pinMessageId} pinned.`);
        }
      } catch (err) {
        log(`Pin message failed: ${err.message}`);
        results.push(`❌ Failed to pin message: ${err.message}`);
      }
    }

    // Unpin a message
    if (unpinMessageId) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Can only unpin messages in text-based channels.');
        } else {
          const message = await channel.messages.fetch(unpinMessageId);
          await message.unpin();
          results.push(`🔓 Message ${unpinMessageId} unpinned.`);
        }
      } catch (err) {
        log(`Unpin message failed: ${err.message}`);
        results.push(`❌ Failed to unpin message: ${err.message}`);
      }
    }

    await interaction.followUp({ ephemeral: true, content: results.join('\n') });
  } else if (sub === 'edit-message') {
    if (!isPremium) {
      return interaction.reply({ ephemeral: true, content: "💎 **Premium Feature**\nEditing bot messages is restricted to premium supporters." });
    }

    const channel = interaction.options.getChannel('channel');
    const msgId = interaction.options.getString('message_id');
    const title = interaction.options.getString('title');
    const body = interaction.options.getString('body');

    if (!channel.isTextBased()) return interaction.reply({ ephemeral: true, content: "Channel must be text-based." });
    
    await interaction.reply({ ephemeral: true, content: "Fetching message..." });
    try {
      const msg = await channel.messages.fetch(msgId);
      if (!msg) return interaction.followUp({ ephemeral: true, content: "Message not found." });
      if (msg.author.id !== client.user.id) return interaction.followUp({ ephemeral: true, content: "I can only edit my own messages." });

      const oldEmbed = msg.embeds[0];
      const newEmbed = {
        title: title || oldEmbed?.title,
        description: body || oldEmbed?.description,
        color: oldEmbed?.color,
        footer: oldEmbed?.footer,
        fields: oldEmbed?.fields,
        image: oldEmbed?.image,
        thumbnail: oldEmbed?.thumbnail
      };

      if (!newEmbed.title && !newEmbed.description) {
        return interaction.followUp({ ephemeral: true, content: "❌ You must provide a title or body to create/edit an embed." });
      }

      await msg.edit({ embeds: [newEmbed] });
      await interaction.followUp({ ephemeral: true, content: "✅ Message updated." });
    } catch (err) {
      log(`Edit message failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `Failed: ${err.message}` });
    }
  }
}

/**
 * Best-effort export of current guild structure into blueprint shape.
 * @param {import('discord.js').Guild} guild
 */
/**
 * Best-effort export of current guild structure into blueprint-like JSON.
 * Includes roles, categories, channels, topics, NSFW flags, rate limits, webhooks, permission overwrites
 * and heuristic mapping to known permission presets.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<object>}
 */
async function exportGuild(guild) {
  // Roles (excluding @everyone and managed)
  const roles = guild.roles.cache.filter(r => !r.managed && r.name !== '@everyone').map(r => ({
    name: r.name,
    permissions: r.permissions.toArray(),
    color: r.color ? '#' + r.color.toString(16).padStart(6, '0') : undefined,
    position: r.position
  }));
  // Categories and channels
  const categories = [];
  guild.channels.cache.forEach(ch => {
    if (ch.type === ChannelType.GuildCategory) {
      const catChannels = guild.channels.cache.filter(c => c.parentId === ch.id);
      const channels = catChannels.map(c => {
        const base = {
          name: c.name,
          type: mapChannelType(c.type),
        };
        if ('topic' in c && c.topic) base.topic = c.topic;
        if ('nsfw' in c && c.nsfw) base.nsfw = true;
        if ('rateLimitPerUser' in c && c.rateLimitPerUser) base.slowmode = c.rateLimitPerUser;
        if (c.type === ChannelType.GuildForum && c.defaultAutoArchiveDuration) base.defaultAutoArchiveDuration = c.defaultAutoArchiveDuration;
        // Permission overwrites export
        if (c.permissionOverwrites?.cache?.size) {
          base.overwrites = c.permissionOverwrites.cache.map(po => ({
            id: po.id,
            type: po.type,
            allow: po.allow.toArray(),
            deny: po.deny.toArray()
          }));
          const preset = inferPreset(base.overwrites, guild);
          if (preset) base.permissionsPreset = preset;
        }
        return base;
      });
      categories.push({ name: ch.name, channels });
    }
  });
  const branding = loadGuildConfig(guild.id).lastBlueprint?.branding || undefined;
  // Enrich channels with webhooks (best effort)
  for (const cat of categories) {
    for (const ch of cat.channels) {
      const real = guild.channels.cache.find(rc => rc.name === ch.name && rc.parent?.name === cat.name);
      if (real && real.isTextBased()) {
        try {
          const hooks = await real.fetchWebhooks();
          if (hooks.size) ch.webhooks = hooks.map(h => ({ name: h.name, id: h.id }));
        } catch {}
      }
    }
  }
  return { name: guild.name, roles, categories, branding };
}

/**
 * Map Discord.js channel type codes to blueprint textual types.
 * @param {number} t
 * @returns {string}
 */
function mapChannelType(t) {
  switch (t) {
    case ChannelType.GuildText: return 'text';
    case ChannelType.GuildVoice: return 'voice';
    case ChannelType.GuildAnnouncement: return 'announcement';
    case ChannelType.GuildForum: return 'forum';
    default: return 'text';
  }
}

/** Known preset heuristics definition */
const PRESET_HEURISTICS = [
  {
    name: 'public-readonly',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const canView = everyone.allow.includes('ViewChannel');
      const deniesSend = everyone.deny.includes('SendMessages');
      return canView && deniesSend;
    }
  },
  {
    name: 'announcement-lock',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const deniesSend = everyone.deny.includes('SendMessages');
      const staff = overwrites.find(o => o.allow.includes('SendMessages') && o.id !== overwrites.__everyoneId);
      return deniesSend && !!staff;
    }
  },
  {
    name: 'staff-private',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const deniesView = everyone.deny.includes('ViewChannel');
      const staff = overwrites.find(o => o.allow.includes('ViewChannel') && o.id !== overwrites.__everyoneId);
      return deniesView && !!staff;
    }
  }
];

/**
 * Infer a permissionsPreset from raw overwrites if it matches heuristic patterns.
 * @param {Array<{id:string,type:number,allow:string[],deny:string[]}>} overwrites
 * @param {import('discord.js').Guild} guild
 * @returns {string|undefined}
 */
function inferPreset(overwrites, guild) {
  if (!overwrites?.length) return undefined;
  // Attach everyone id for heuristics
  overwrites.__everyoneId = guild.roles.everyone.id;
  for (const p of PRESET_HEURISTICS) {
    try { if (p.test(overwrites)) return p.name; } catch {}
  }
  return undefined;
}
