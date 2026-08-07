import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NotificationProvider } from "./NotificationProvider.js";
import { WindowsNotifier, type NodeNotifierLike } from "./WindowsNotifier.js";
import type { ExecFileFunction } from "./MacNotifier.js";
import type { Notification } from "./Notification.js";

const execFileAsync = promisify(execFile) as ExecFileFunction;

export class LinuxNotifier implements NotificationProvider {
  readonly name = "desktop";
  private readonly fallback: NotificationProvider;

  constructor(
    enableSound = true,
    private readonly run: ExecFileFunction = execFileAsync,
    nodeNotifier?: NodeNotifierLike
  ) {
    this.fallback = new WindowsNotifier(enableSound, nodeNotifier);
  }

  async notify(notification: Notification): Promise<void> {
    const { title, message } = notification;
    try {
      await this.run("notify-send", [title, message]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.fallback.notify(notification);
    }
  }
}
