/** Clears provider/mailbox config back to defaults, keeping the profile. */
import { DEFAULT_SETTINGS, saveSettings } from "../src/lib/settings";

saveSettings({ ai: DEFAULT_SETTINGS.ai, mail: DEFAULT_SETTINGS.mail });
console.log("AI provider and mailbox settings reset to defaults.");
