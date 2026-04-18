
- **Use Claude to do a full mobile UI critique** — Open the app in Chrome's mobile responsive view (or equivalent), take screenshots of every screen, and ask Claude to critique what's broken, misaligned, or missing. Use this as the starting bug list for mobile.


- **Ask Claude to act as a high-agency user and click through everything** — Beyond screenshots, ask Claude to simulate being a real user and go through every single button, feature, and functionality in the mobile view and report what works and what doesn't. Use this output as an additional bug list.

- **Replace "Get ideas" and "Ask anything" with better preset prompts** — The current four starting prompt options are generic and uninspiring. Come up with better, more specific, and more useful preset prompts that match what a WeddingEase user would actually want to ask. Think about the most common wedding planning questions and make those the starting options. Ask Claude to suggest a better set of four.


- **Unified login between chatbot and WeddingEase.ai** — The auth system must be the same. One account = access to both the chatbot and the WeddingEase website. This was flagged in the last feedback round and is still pending.

**12. 🔔 Reminders — Sync with Phone**

- **Reminders should sync to the user's actual phone calendar/reminders app** — When a user sets a reminder in the chatbot, it should not only exist inside WeddingEase. Give the user an option to add it to their phone.
  - For iPhone: export as a **.ics file** (works with Apple Calendar and Reminders)
  - For Android: same .ics format works with Google Calendar
  - Ideally: provide a direct "Add to Calendar" or "Add to Phone Reminders" button that handles this automatically

---

- **Use OpenAI Whisper in the backend** — Whisper is the industry standard for accurate speech-to-text and will give significantly better transcription results than a live word-by-word approach, especially for Indian accents and mixed-language speech.

**15. ❤️ Liked Artifacts — Reconsider the Feature**

- **Clarify the purpose of the Liked section** — It currently shows all liked messages/artifacts. Think through whether this feature adds enough standalone value, or if it's just noise. If you keep it, make it more useful — e.g. allow users to organise their liked items, export them, or reference them in chat. If it doesn't add clear value, consider removing or merging it.

---
