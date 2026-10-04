/** Clears provider/mailbox config back to defaults, keeping the profile. */
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { DEFAULT_SETTINGS, saveSettings } from "../src/lib/settings";

// Settings are per account, so this resets every account's provider config.
const all = db.select().from(users).all();
if (!all.length) {
  console.log("No accounts yet — nothing to reset.");
} else {
  for (const user of all) {
    saveSettings(user.id, { ai: DEFAULT_SETTINGS.ai, mail: DEFAULT_SETTINGS.mail });
    console.log(`Reset provider and mailbox settings for ${user.email}.`);
  }
}
