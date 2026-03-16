**Role:** Lead Full-Stack AI Engineer.

**Project:** "WeddingEase" - A Multi-Agent AI Platform.
**Core Objective:** Design a prototype where TTS, Translation, and Auth are "Initial Pipeline" features, followed by 6-mode routing.

**Technical Requirements:**
1. **Initial Pipeline (Global Middleware):** - **Inbound:** Speech-to-Text (Whisper/Google) -> Translation (DeepL/Google) -> Standardized English Text.
   - **Outbound:** AI Response -> Translation (if needed) -> Text-to-Speech (ElevenLabs/OpenAI).
2. **User Management (Firebase):** - Implement **Firebase Auth** (Email/Password) for Signup/Login.
   - Define a `users` collection in Firestore to store profile data (Name, Wedding Date, Budget).
3. **Persistent Chat History:** - Define a `chats` collection where each document represents a "Thread."
   - Each thread contains a `messages` sub-collection with timestamps and "Mode" tags.
   - Provision for a "New Chat" function that clears the local state and creates a new Firestore Thread ID.
4. **6-Mode Logic:** Stylist (with Firebase redirects), Planner, Therapist, Knowledge, Consultant, Assistant.

**Deliverables:**
- **Firebase Schema:** Detailed JSON for `users`, `chats`, and `products`.
- **Pipeline Pseudo-code:** A Node.js/Python example of how the input moves through Translation -> Router -> Mode -> TTS.
- **System Prompts:** Individual prompts for all 6 modes.
- **State Management:** Logic for how the "New Chat" button interacts with Firebase.

**Tone:** Highly technical, developer-ready, and structured for an MVP.

**AI Chat api** use the azure foundry chat api 
