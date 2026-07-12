import { listDueReminders, markReminder } from "./store.js";
import { log } from "../logger.js";

export function startReminderScanner(client, { intervalMs = 30_000 } = {}) {
  const tick = async () => {
    for (const r of listDueReminders()) {
      try {
        const user = await client.users.fetch(r.userId);
        await user.send(`⏰ Reminder: ${r.text}`);
        markReminder(r.id, "sent");
        log(`reminder_sent ${r.id}`);
      } catch (err) {
        markReminder(r.id, "failed");
        log(`reminder_failed ${r.id}: ${err.message}`);
      }
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}
