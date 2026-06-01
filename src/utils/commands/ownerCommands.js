/**
 * Owner-only slash commands use Discord "User Install" so they only appear for
 * accounts that installed the app to their user (not for every server member).
 * Handlers still check BOT_OWNER_ID.
 */

/** @see ApplicationIntegrationType.GuildInstall */
export const INTEGRATION_GUILD = 0;
/** @see ApplicationIntegrationType.UserInstall */
export const INTEGRATION_USER = 1;

/** @see InteractionContextType.Guild */
export const CONTEXT_GUILD = 0;
/** @see InteractionContextType.BotDM */
export const CONTEXT_BOT_DM = 1;
/** @see InteractionContextType.PrivateChannel */
export const CONTEXT_PRIVATE = 2;

/**
 * Public /setup — guild-installed bots only.
 * @param {import('discord.js').RESTPostAPIChatInputApplicationCommandsJSONBody} cmd
 */
export function asGuildCommand(cmd) {
  const { default_member_permissions: _d, dm_permission: _dm, ...rest } = cmd;
  return {
    ...rest,
    integration_types: [INTEGRATION_GUILD],
    contexts: [CONTEXT_GUILD]
  };
}

/**
 * Owner tools (/grant, /announce) — user-install only.
 * @param {import('discord.js').RESTPostAPIChatInputApplicationCommandsJSONBody} cmd
 */
export function asOwnerUserCommand(cmd) {
  const { default_member_permissions: _d, ...rest } = cmd;
  return {
    ...rest,
    integration_types: [INTEGRATION_USER],
    contexts: [CONTEXT_GUILD, CONTEXT_BOT_DM, CONTEXT_PRIVATE],
    dm_permission: true
  };
}
