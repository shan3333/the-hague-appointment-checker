import notifier from "node-notifier";
import type { NotificationProvider } from "./NotificationProvider.js";

export interface NodeNotifierLike {
  notify(
    options: { title: string; message: string; sound: boolean; wait: boolean },
    callback: (error: Error | null | undefined) => void
  ): void;
}

export class WindowsNotifier implements NotificationProvider {
  constructor(
    private readonly enableSound = true,
    private readonly client: NodeNotifierLike = notifier
  ) {}

  async notify(title: string, message: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.client.notify(
        { title, message, sound: this.enableSound, wait: false },
        error => error ? reject(error) : resolve()
      );
    });
  }
}
