export interface NotificationProvider {
  notify(title: string, message: string): Promise<void>;
}

export type NotificationProviderSetting =
  | "auto"
  | "telegram"
  | "email"
  | "discord"
  | "slack";
