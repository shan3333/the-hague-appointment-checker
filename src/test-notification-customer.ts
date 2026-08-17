import type { CustomerConfig } from "./customers/CustomerConfig.js";

export const TEST_NOTIFICATION_CUSTOMER_ID = "customer-test-notification";

export function testNotificationCustomer(chatId: string): CustomerConfig {
  return {
    id: TEST_NOTIFICATION_CUSTOMER_ID,
    service: "brp_existing_bsn",
    chatId,
    enabled: true,
    filter: { kind: "within", amount: 30, unit: "d", source: "30d" },
    expiresAt: "9999-12-31"
  };
}
