export type TelegramConfig =
  | { enabled: false }
  | { enabled: true; botToken: string; chatId: string; timeoutMs: number };

export function parseTelegramConfig(
  environment: NodeJS.ProcessEnv,
  timeoutMs = 10_000
): TelegramConfig {
  const botToken = environment.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = environment.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!botToken || !chatId) return { enabled: false };
  return { enabled: true, botToken, chatId, timeoutMs };
}

export function redactTelegramConfig(config: TelegramConfig): Record<string, boolean> {
  return config.enabled
    ? { enabled: true, botTokenConfigured: true, chatIdConfigured: true }
    : { enabled: false, botTokenConfigured: false, chatIdConfigured: false };
}
