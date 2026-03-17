To implement your WeddingEase prototype with integrated speech, translation, and persistent storage, follow these execution steps. This workflow utilizes Azure AI Foundry for the AI pipeline and Firebase for user management and database needs.

Technical Execution Steps
1. Resource Provisioning
Azure AI Foundry: Create a new project and deploy a GPT-4o model (best for reasoning across multiple modes).

Azure AI Speech: Enable the "Speech-to-Text" service with Continuous Language Identification (this allows the system to detect if the user is speaking Gujarati, Hindi, etc., without a manual toggle).

Azure AI Translator: Deploy a Translator resource to handle the conversion of non-English inputs/outputs.

Firebase: Create a project and enable Firebase Auth (Email/Password) and Firestore.

2. The Inbound Pipeline (Pre-Processing)
Speech-to-Text (STT): When a user sends audio, the system transcribes it. The LanguageID feature captures the source language code (e.g., gu-IN for Gujarati).

Normalization: If the detected language is not English, the Azure AI Translator node converts the text into English. This ensures all 6 of your agents (Stylist, Planner, etc.) receive high-quality, standardized input.

3. The Logic & Router Layer
Primary Router: An LLM node analyzes the English text to identify the user's intent.

Mode Switching: The Router directs the prompt to one of your 6 agents based on the content (e.g., "I'm stressed" → Therapist Mode; "Show me rings" → Stylist Mode).

Firebase Integration: * The Stylist Mode queries your products collection in Firestore.

It retrieves the ProductUID and returns a link: https://weddingease.ai/product-detail/[ProductUID].

4. The Outbound Pipeline (Post-Processing)
Target Translation: The AI agent generates a response in English. The system automatically translates this back into the user's original detected language from Step 2.

Text Output: The final translated text is sent to the UI. (As per your requirement, no audio output is generated to keep the experience fast).

5. Database & Session Management
Auth & Schema: Use Firebase Auth for Login/Signup. Store user preferences (like their primary language) in the users collection.

Chat Persistence: * Every message is saved to a messages sub-collection under a specific threadId.

New Chat: Clicking "New Chat" in your UI triggers a function that generates a new Firestore thread_id, giving the user a clean slate while keeping their global wedding profile (budget, date) intact.

Implementation Pro-Tip: The "Redirect" Logic
For the Stylist Mode, your system prompt should strictly instruct the AI:

"Whenever you recommend a product from the Firebase results, you must display it as: [Product Name](https://weddingease.ai/product-detail/[ProductUID]). Do not hallucinate links."