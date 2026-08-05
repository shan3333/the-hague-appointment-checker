import type { NotificationProvider, NotificationProviderSetting } from "./NotificationProvider.js";
import { MacNotifier } from "./MacNotifier.js";
import { WindowsNotifier } from "./WindowsNotifier.js";
import { LinuxNotifier } from "./LinuxNotifier.js";

export interface NotificationProviderSet {
  darwin: NotificationProvider;
  win32: NotificationProvider;
  linux: NotificationProvider;
}

export interface NotificationServiceOptions {
  platform?: NodeJS.Platform;
  provider?: NotificationProviderSetting;
  enableSound?: boolean;
  providers?: NotificationProviderSet;
}

export class NotificationService {
  private readonly selectedProvider: NotificationProvider;
  readonly providerName: string;
  readonly platform: NodeJS.Platform;

  constructor(options: NotificationServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    const requested = options.provider ?? "auto";
    if (requested !== "auto") {
      throw new Error(
        `Notification provider "${requested}" is reserved for a future integration and is not implemented`
      );
    }

    const providers = options.providers ?? {
      darwin: new MacNotifier(options.enableSound),
      win32: new WindowsNotifier(options.enableSound),
      linux: new LinuxNotifier(options.enableSound)
    };
    this.selectedProvider = this.selectPlatformProvider(providers);
    this.providerName = this.selectedProvider.constructor.name;
  }

  notify(title: string, message: string): Promise<void> {
    return this.selectedProvider.notify(title, message);
  }

  private selectPlatformProvider(providers: NotificationProviderSet): NotificationProvider {
    if (this.platform === "darwin") return providers.darwin;
    if (this.platform === "win32") return providers.win32;
    if (this.platform === "linux") return providers.linux;
    throw new Error(`Desktop notifications are not supported on platform "${this.platform}"`);
  }
}
