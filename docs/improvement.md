Here's the full breakdown, copy-paste ready:

---

**🎯 WeddingEase Chatbot — Full Product Feedback To-Do List**

---

**1. 🔐 Auth & Sign-Up Flow**

- **Google OAuth warning** — Right now when a user tries to sign up with Google, it shows a screen saying "Google hasn't verified this app." This needs to be fixed and verified with Google *before* the sign-up flow is made live. Users will not trust an app showing this warning.

- **Country code dropdown** — In the contact/phone number field during sign-up, the user should be able to *select* their country code from a dropdown, not type it in manually.

- **Password strength enforcement** — There is currently no minimum password standard. Enforce industry-standard password rules: at least 1 capital letter, 1 number, and 1 special character. Research what the current best industry standard is and apply it. This prevents users from setting weak, easily hackable passwords.

- **Duplicate account detection (Email + Google OAuth)** — If a user has already signed up manually with their email, and later tries to sign up or log in with Google OAuth using the same Gmail address, the system should detect this and merge them into a single account (preferring the Google OAuth login). Users should never end up with two separate accounts for the same email ID.

---

**2. 💳 Payments & Monetisation**

- **Integrate a payment gateway** — Add PayU (preferred for India) or Stripe so that after a user exhausts their free trial messages, they are prompted to pay to continue. Without this, users can use the product infinitely for free, which is not sustainable.

- **Hard-stop after free trial** — Once the free trial limit is hit, the user must be blocked from continuing to use the product until they pay. This is both a business and cost-control requirement.

---

**3. 🖥️ UI & Navigation Fixes**

- **Remove duplicate Planner label** — On the main page, both "Planner" and "My Planner" are showing. This is redundant. Remove "My Planner" and keep just "Planner."

- **Allow direct creation on every tab page** — Right now, on pages like Planner, Liked, Reminders, Timelines, and Gallery, the user can't actually *do* anything directly on the page — they can only get things saved there via the chatbot. This needs to change. On every tab, users should be able to create content directly (like how Notes already lets you create a new note on that page). This is a core usability issue.

- **Remove the keyboard shortcuts button from the main page** — It doesn't add meaningful value and takes up space. It's unnecessary clutter.

---

**4. 🤖 AI Behaviour & Artifacts**

- **Checklists should be saved as Notes, not generated as images** — When a user asks the chatbot to "create a checklist," it is currently generating an *image* of a checklist. This is wrong. Instead, it should create a proper Note artifact with the checklist content inside it, which the user can then go to the Notes tab and view, edit, or reference.

- **Image generation should be triggered only when explicitly asked** — The AI should not auto-generate images in response to general requests. Images should only be created when the user specifically asks for an image or when using a dedicated image sub-agent.

- **Chat must be able to create and reference Notes** — The chat should be able to save notes on the user's behalf. When a user asks for a checklist, a plan, a to-do list, or a reminder, the AI should create the corresponding artifact (Note, Plan, Reminder, etc.) and save it to the relevant tab so the user can access it directly.

- **Treat all tab content as AI-creatable artifacts** — Plans, Reminders, Timelines, Notes, and Gallery content should all be things the AI can create, not just display. Think of each tab as a workspace the AI can write into.

- **Sub-agents must interact with all tab features** — The specialised sub-agents in the product must be able to interact with Planner, Timelines, Gallery, Notes, and Reminders — not just respond in chat. They should be able to create and save things in these sections.

- **System prompts must include WeddingEase branding awareness** — Every agent's system prompt should acknowledge that WeddingEase is powering the platform. In their responses, agents should subtly reference WeddingEase as the platform behind the experience.

- **Agents should subtly market WeddingEase consultants and premium tiers** — The vision is that users come to the chatbot, love it, and naturally discover WeddingEase's premium consulting services. Agents should, at appropriate moments, mention that for deeper, personalised help, users can work with WeddingEase's consultants or upgrade to a higher tier. This should be *subtle and natural*, not spammy.

---

**5. ⚙️ Settings & User Profile**

- **Fix the profile page** — When a user clicks on their profile/avatar in the top right corner, they should see their own details: name, email address, current plan/tier, and options to update these. Right now it only shows language settings, which makes no sense.

- **Allow users to update their details and plan** — From the settings or profile page, users should be able to: update their email address, see their current pricing tier, upgrade or downgrade their plan, and manage account-related settings.

- **Research ChatGPT and Claude's settings pages** — Study in depth what settings, account management options, and profile features ChatGPT and Claude offer to their users (not product features — the surrounding configuration layer: identity, plan management, billing, preferences, etc.). Use this as the benchmark for what WeddingEase's settings page should look like.

- **AI Voice feature — fix or remove** — The AI Voice option exists in settings, but there is no actual voice-to-voice interaction happening in the product. Either: (a) properly implement speech-to-speech so users can *speak* to the AI and the AI *speaks back*, or (b) remove the AI Voice option entirely until this is built properly.

- **Language detection is a nice-to-have, not a must-have** — AI models naturally respond in whatever language the user writes or asks in. This feature is not critical right now and can be deprioritised.

---

**6. 🌐 Landing Page & WeddingEase Integration**

- **Update the WeddingEase landing page** — The WeddingEase.ai website/landing page should promote the chatbot and allow users to discover it, sign up, and start using it directly from there. The chatbot should not exist as a separate, disconnected product.

- **Unified account across chatbot and WeddingEase.ai** — This is critical. If a user creates an account on the chatbot, that *is* their WeddingEase account. There should be no separate sign-up for the two platforms. One login, one identity, everywhere.

- **Seamless navigation between chatbot and WeddingEase.ai** — A logged-in user should be able to move between the chatbot and the WeddingEase website without friction. From the chatbot, there should be a way to go to your WeddingEase dashboard. From WeddingEase, there should be a way to go to the chatbot. Vice versa, always accessible.

---

**7. 🔒 Security Review**

- **Run a Claude Code security review** — Use Claude Code's security review capability to scan the entire codebase and identify all potential vulnerabilities. Claude will surface issues that a human reviewer would likely miss.

- **Secrets management** — Ensure that all API keys, tokens, and sensitive credentials are stored in environment variables or a secrets manager — not hardcoded anywhere in the source code.

- **Prevent free unlimited usage** — Make sure there is no way for a user to bypass the payment wall and use the product without paying after their free trial ends.

- **Resolve vulnerabilities before launch** — Go through the list of security issues Claude surfaces and fix as many as possible before the product goes live publicly.

---

**8. 🚀 Pre-Launch Technical Checklist**

- **Generate a full pre-launch checklist using Claude** — Ask Claude to produce a comprehensive B2C app launch checklist covering: Firebase setup, database configuration, authentication, frontend, backend, production environment, and anything else needed before going live.

- **Confirm payment integration is fully working** — Payment must be tested end-to-end (free trial → payment prompt → successful payment → continued access) before launch.

- **Set up user analytics** — Integrate PostHog or Amplitude to track user behaviour, funnels, and retention from day one.

- **Set up error monitoring** — Integrate Sentry (or a similar tool) to capture crashes, errors, and bugs in production automatically.

- **Set up a user feedback tool** — Ask Claude what tools are best for collecting in-product user feedback and implement the best option.

---

**9. 🧪 Bug Bash & Beta Launch**

- **Clearly label the product as "Beta"** — Somewhere visible on the product (header, login page, etc.), it must clearly say that this is a beta version. Users need to know this so they are forgiving of rough edges and more inclined to give feedback.

- **Add a minimalistic feedback button** — There should always be a simple, always-accessible button for users to submit feedback. Clicking it should let users: voice-record their feedback *or* type it out, and attach screenshots if needed. This turns every user into a tester.

- **Conduct an internal bug bash** — The whole WeddingEase team should sit down and use the product intensively like brand-new users. This session should be recorded on a Teams/Zoom call so the audio and screen are captured.

- **Transcribe the bug bash recording and process it with AI** — After the session, transcribe the recording and pass the full transcript through Claude or ChatGPT to generate a structured, specific to-do list for developers. This removes the need to manually write meeting notes.

- **Distribute beta only to friends, family, and close circle first** — Do not do a broad public launch immediately. Share it with people you trust who will give honest feedback. Fix everything they report before going wider.

- **Fix bugs, then go public** — After the internal bug bash and close-circle beta, fix the issues that come up. Once stable, launch publicly. After that, users will report even more bugs — the feedback button and analytics tools will handle that loop automatically.

---