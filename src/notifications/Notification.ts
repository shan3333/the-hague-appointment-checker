export type NotificationMetadataValue = string | number | boolean;

export interface Notification {
  readonly title: string;
  readonly message: string;
  readonly url?: string;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, NotificationMetadataValue>>;
}

export interface NotificationDraft {
  title: string;
  message: string;
  url?: string;
  timestamp?: Date | string;
  metadata?: Readonly<Record<string, NotificationMetadataValue>>;
}

export function createNotification(draft: NotificationDraft, now = new Date()): Notification {
  const timestamp = draft.timestamp instanceof Date
    ? draft.timestamp.toISOString()
    : draft.timestamp ?? now.toISOString();
  return Object.freeze({
    title: draft.title,
    message: draft.message,
    ...(draft.url ? { url: draft.url } : {}),
    timestamp,
    metadata: Object.freeze({ ...(draft.metadata ?? {}) })
  });
}
