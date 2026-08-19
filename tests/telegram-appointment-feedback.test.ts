import { describe, expect, it } from "vitest";
import { telegramAppointmentFeedbackKeyboard } from "../src/notifications/TelegramAppointmentFeedback.js";

describe("Telegram appointment feedback keyboard", () => {
  it("uses the shared labels and preserves callback data", () => {
    expect(telegramAppointmentFeedbackKeyboard("c001abcd", "a42abcde")).toEqual({
      inline_keyboard: [[
        { text: "✅ I booked it", callback_data: "b:c001abcd:a42abcde" },
        { text: "👀 Keep looking", callback_data: "n:c001abcd:a42abcde" }
      ]]
    });
  });
});
