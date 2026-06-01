# Security

## Reporting

Email **support@mischiefmanager.io** or use the [support server](https://discord.gg/NEePze3rZd). Do not post tokens or `.env` contents in public channels.

## Secrets

- Never commit `.env`, bot tokens, or API keys.
- Set secrets only in Railway (or your host) and in local `.env` (gitignored).
- `SUPPORT_SERVER_INVITE` is public; it is not a secret.

## Bot permissions

The bot requests Administrator to create channels and roles. Review permissions after each build and remove access you do not need.
