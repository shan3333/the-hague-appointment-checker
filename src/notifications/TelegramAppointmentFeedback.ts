export const TELEGRAM_BOOKED_BUTTON_TEXT = "✅ I booked it";
export const TELEGRAM_KEEP_LOOKING_BUTTON_TEXT = "👀 Keep looking";

export function telegramAppointmentFeedbackKeyboard(customerKey: string, alertId: string) {
  return {
    inline_keyboard: [[
      { text: TELEGRAM_BOOKED_BUTTON_TEXT, callback_data: `b:${customerKey}:${alertId}` },
      { text: TELEGRAM_KEEP_LOOKING_BUTTON_TEXT, callback_data: `n:${customerKey}:${alertId}` }
    ]]
  };
}
