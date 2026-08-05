import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NotificationProvider } from "./NotificationProvider.js";
import { WindowsNotifier, type NodeNotifierLike } from "./WindowsNotifier.js";
import type { ExecFileFunction } from "./MacNotifier.js";

const execFileAsync = promisify(execFile) as ExecFileFunction;

export class LinuxNotifier implements NotificationProvider {
  private readonly fallback: NotificationProvider;

  constructor(
    enableSound = true,
    private readonly run: ExecFileFunction = execFileAsync,
    nodeNotifier?: NodeNotifierLike
  ) {
    this.fallback = new WindowsNotifier(enableSound, nodeNotifier);
  }

  async notify(title: string, message: string): Promise<void> {
    try {
      await this.run("notify-send", [title, message]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.fallback.notify(title, message);
    }
  }
}
