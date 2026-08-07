import { describe, expect, it } from "vitest";
import { parseTelegramConfig, redactTelegramConfig } from "../src/notifications/TelegramConfig.js";

describe("Telegram configuration", () => {
  it("is disabled by default", () => {
    expect(parseTelegramConfig({})).toEqual({ enabled: false });
  });

  it("automatically enables when both credentials are present and trims whitespace", () => {
    expect(parseTelegramConfig({
      TELEGRAM_BOT_TOKEN: " token-value ",
      TELEGRAM_CHAT_ID: " chat-value "
    }, 500)).toEqual({ enabled: true, botToken: "token-value", chatId: "chat-value", timeoutMs: 500 });
  });

  it("does not register when only the chat ID is present", () => {
    expect(parseTelegramConfig({ TELEGRAM_CHAT_ID: "chat" })).toEqual({ enabled: false });
  });

  it("does not register when only the bot token is present", () => {
    expect(parseTelegramConfig({ TELEGRAM_BOT_TOKEN: "token" })).toEqual({ enabled: false });
  });

  it("treats whitespace-only credentials as missing", () => {
    expect(parseTelegramConfig({
      TELEGRAM_BOT_TOKEN: "  ",
      TELEGRAM_CHAT_ID: " chat "
    })).toEqual({ enabled: false });
  });

  it("never exposes secrets through the redacted description", () => {
    const config = parseTelegramConfig({
      TELEGRAM_BOT_TOKEN: "super-secret-token",
      TELEGRAM_CHAT_ID: "private-chat-id"
    });
    const serialized = JSON.stringify(redactTelegramConfig(config));
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("private-chat-id");
    expect(serialized).toContain("botTokenConfigured");
  });
});
