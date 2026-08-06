import notifier from "node-notifier";
import type { NotificationProvider } from "./NotificationProvider.js";
import type { Notification } from "./Notification.js";

export interface NodeNotifierLike {
  notify(
    options: { title: string; message: string; sound: boolean; wait: boolean },
    callback: (error: Error | null | undefined) => void
  ): void;
}

export class WindowsNotifier implements NotificationProvider {
  readonly name = "desktop";
  constructor(
    private readonly enableSound = true,
    private readonly client: NodeNotifierLike = notifier
  ) {}

  async notify(notification: Notification): Promise<void> {
    const { title, message } = notification;
    await new Promise<void>((resolve, reject) => {
      this.client.notify(
        { title, message, sound: this.enableSound, wait: false },
        error => error ? reject(error) : resolve()
      );
    });
  }
}
