import type { Notification } from "./Notification.js";

export interface NotificationProvider {
  readonly name?: string;
  notify(notification: Notification): Promise<void>;
}

export type NotificationProviderSetting =
  | "auto"
  | "telegram"
  | "email"
  | "discord"
  | "slack";
