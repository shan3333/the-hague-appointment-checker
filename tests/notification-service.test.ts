import { describe, expect, it, vi } from "vitest";
import { NotificationService, type NotificationProviderSet } from "../src/notifications/NotificationService.js";
import type { NotificationProvider } from "../src/notifications/NotificationProvider.js";
import type { Notification } from "../src/notifications/Notification.js";
import { MacNotifier } from "../src/notifications/MacNotifier.js";

class ProviderStub implements NotificationProvider {
  constructor(readonly name: string) {}
  notify = vi.fn<(notification: Notification) => Promise<void>>().mockResolvedValue(undefined);
}

function providers(): NotificationProviderSet {
  return {
    darwin: new ProviderStub("MacStub"),
    win32: new ProviderStub("WindowsStub"),
    linux: new ProviderStub("LinuxStub")
  };
}

const draft = {
  title: "Title",
  message: "Message",
  url: "https://example.test",
  timestamp: "2026-08-06T15:20:00.000Z",
  metadata: { earliestMatchingDate: "2026-08-10", matchingAppointmentCount: 2 }
};

describe("NotificationService provider selection", () => {
  it.each([
    ["darwin", "ProviderStub"],
    ["win32", "ProviderStub"],
    ["linux", "ProviderStub"]
  ] as const)("selects %s automatically", (platform, expected) => {
    const service = new NotificationService({ platform, providers: providers() });
    expect(service.providerName).toBe(expected);
  });

  it("creates one notification and sends the identical object to desktop and Telegram", async () => {
    const injected = providers();
    const telegram = new ProviderStub("TelegramStub");
    const service = new NotificationService({
      platform: "darwin",
      providers: injected,
      telegram: { enabled: true, botToken: "token", chatId: "chat", timeoutMs: 1000 },
      telegramProvider: telegram
    });
    const result = await service.notify(draft);
    const desktopNotification = (injected.darwin.notify as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const telegramNotification = telegram.notify.mock.calls[0]?.[0];
    expect(desktopNotification).toBe(result.notification);
    expect(telegramNotification).toBe(result.notification);
    expect(result.notification).toMatchObject(draft);
    expect(result.deliveries).toHaveLength(2);
  });

  it("does not create a Telegram delivery when disabled", async () => {
    const telegram = new ProviderStub("TelegramStub");
    const service = new NotificationService({
      platform: "darwin",
      providers: providers(),
      telegram: { enabled: false },
      telegramProvider: telegram
    });
    const result = await service.notify(draft);
    expect(telegram.notify).not.toHaveBeenCalled();
    expect(result.deliveries.map(delivery => delivery.channel)).toEqual(["desktop"]);
  });

  it("continues desktop delivery when Telegram fails", async () => {
    const injected = providers();
    const telegram = new ProviderStub("TelegramStub");
    telegram.notify.mockRejectedValue(new Error("telegram unavailable"));
    const logFailure = vi.fn();
    const service = new NotificationService({
      platform: "darwin",
      providers: injected,
      telegram: { enabled: true, botToken: "token", chatId: "chat", timeoutMs: 1000 },
      telegramProvider: telegram,
      logFailure
    });
    const result = await service.notify(draft);
    expect(injected.darwin.notify).toHaveBeenCalledTimes(1);
    expect(result.deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "desktop", success: true }),
      expect.objectContaining({ channel: "telegram", success: false })
    ]));
    expect(logFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps channel names explicit", () => {
    expect(() => new NotificationService({ provider: "telegram" })).toThrow(/TELEGRAM_BOT_TOKEN.*TELEGRAM_CHAT_ID/);
  });
});

describe("MacNotifier", () => {
  it("uses osascript arguments and safely escapes AppleScript strings", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const provider = new MacNotifier(true, run);
    await provider.notify({
      title: 'Title "quoted"',
      message: 'Line one\nMessage "quoted"',
      timestamp: "2026-08-06T15:20:00.000Z",
      metadata: {}
    });

    expect(run).toHaveBeenCalledTimes(1);
    const [executable, args] = run.mock.calls[0] as [string, string[]];
    expect(executable).toBe("osascript");
    expect(args[0]).toBe("-e");
    expect(args[1]).toContain('sound name "Glass"');
    expect(args[1]).toContain('Title \\"quoted\\"');
    expect(args[1]).toContain('Message \\"quoted\\"');
  });
});
