import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NotificationProvider } from "./NotificationProvider.js";
import type { Notification } from "./Notification.js";

export type ExecFileFunction = (executable: string, args: string[]) => Promise<unknown>;

const execFileAsync = promisify(execFile) as ExecFileFunction;

function escapeAppleScriptString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n");
}

export class MacNotifier implements NotificationProvider {
  readonly name = "desktop";
  constructor(
    private readonly enableSound = true,
    private readonly run: ExecFileFunction = execFileAsync
  ) {}

  async notify(notification: Notification): Promise<void> {
    const { title, message } = notification;
    const sound = this.enableSound ? ' sound name "Glass"' : "";
    const script = `display notification "${escapeAppleScriptString(message)}" with title "${escapeAppleScriptString(title)}"${sound}`;
    await this.run("osascript", ["-e", script]);
  }
}
