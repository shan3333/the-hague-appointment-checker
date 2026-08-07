import type { NotificationProvider, NotificationProviderSetting } from "./NotificationProvider.js";
import { createNotification, type Notification, type NotificationDraft } from "./Notification.js";
import { MacNotifier } from "./MacNotifier.js";
import { WindowsNotifier } from "./WindowsNotifier.js";
import { LinuxNotifier } from "./LinuxNotifier.js";
import { TelegramNotifier } from "./TelegramNotifier.js";
import type { TelegramConfig } from "./TelegramConfig.js";
import { logger } from "../logger.js";

export interface NotificationProviderSet {
  darwin: NotificationProvider;
  win32: NotificationProvider;
  linux: NotificationProvider;
}

export type NotificationChannel = "desktop" | "telegram";

export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  provider: string;
  success: boolean;
  error?: string;
}

export interface NotificationDispatchResult {
  notification: Notification;
  deliveries: NotificationDeliveryResult[];
}

export interface NotificationServiceOptions {
  platform?: NodeJS.Platform;
  provider?: NotificationProviderSetting;
  enableSound?: boolean;
  desktopEnabled?: boolean;
  telegram?: TelegramConfig;
  providers?: NotificationProviderSet;
  telegramProvider?: NotificationProvider;
  logFailure?: (result: NotificationDeliveryResult) => void;
}

export class NotificationService {
  private readonly deliveryProviders: Array<{ channel: NotificationChannel; provider: NotificationProvider }>;
  readonly providerName: string;
  readonly platform: NodeJS.Platform;

  constructor(options: NotificationServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    const requested = options.provider ?? "auto";
    if (requested !== "auto") {
      throw new Error(
        `Desktop notification provider "${requested}" is not implemented; configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for Telegram`
      );
    }

    const providers = options.providers ?? {
      darwin: new MacNotifier(options.enableSound),
      win32: new WindowsNotifier(options.enableSound),
      linux: new LinuxNotifier(options.enableSound)
    };
    const desktopProvider = this.selectPlatformProvider(providers);
    this.providerName = desktopProvider.constructor.name;
    this.deliveryProviders = [];
    if (options.desktopEnabled ?? true) {
      this.deliveryProviders.push({ channel: "desktop", provider: desktopProvider });
    }
    if (options.telegram?.enabled) {
      const telegramProvider = options.telegramProvider ?? new TelegramNotifier(
        options.telegram.botToken,
        options.telegram.chatId,
        options.telegram.timeoutMs
      );
      this.deliveryProviders.push({ channel: "telegram", provider: telegramProvider });
    }
    this.logFailure = options.logFailure ?? (result => logger.error(`${result.channel} notification failure`, {
      provider: result.provider,
      error: result.error
    }));
  }

  private readonly logFailure: (result: NotificationDeliveryResult) => void;

  async notify(draft: NotificationDraft): Promise<NotificationDispatchResult> {
    const notification = createNotification(draft);
    const deliveries = await Promise.all(this.deliveryProviders.map(async ({ channel, provider }) => {
      const providerName = provider.constructor.name;
      try {
        await provider.notify(notification);
        return { channel, provider: providerName, success: true } satisfies NotificationDeliveryResult;
      } catch (error) {
        const result = {
          channel,
          provider: providerName,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies NotificationDeliveryResult;
        this.logFailure(result);
        return result;
      }
    }));
    return { notification, deliveries };
  }

  private selectPlatformProvider(providers: NotificationProviderSet): NotificationProvider {
    if (this.platform === "darwin") return providers.darwin;
    if (this.platform === "win32") return providers.win32;
    if (this.platform === "linux") return providers.linux;
    throw new Error(`Desktop notifications are not supported on platform "${this.platform}"`);
  }
}
