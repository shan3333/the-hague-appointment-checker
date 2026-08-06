import { describe, expect, it } from "vitest";
import { createNotification } from "../src/notifications/Notification.js";

describe("Notification model", () => {
  it("creates an immutable notification with URL, timestamp, and metadata", () => {
    const notification = createNotification({
      title: "Appointment available",
      message: "Open the booking page.",
      isSimulation: true,
      url: "https://example.test",
      timestamp: new Date("2026-08-06T15:20:00.000Z"),
      metadata: { matchingAppointmentCount: 2 }
    });
    expect(notification).toEqual({
      title: "Appointment available",
      message: "Open the booking page.",
      isSimulation: true,
      url: "https://example.test",
      timestamp: "2026-08-06T15:20:00.000Z",
      metadata: { matchingAppointmentCount: 2 }
    });
    expect(Object.isFrozen(notification)).toBe(true);
    expect(Object.isFrozen(notification.metadata)).toBe(true);
  });
});
