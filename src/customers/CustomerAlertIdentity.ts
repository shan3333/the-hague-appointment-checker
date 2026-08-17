import { createHash, randomBytes } from "node:crypto";

export function telegramCustomerKey(customerId: string): string {
  return createHash("sha256").update(customerId).digest("hex").slice(0, 8);
}

export function createAlertId(): string {
  return randomBytes(4).toString("hex");
}
