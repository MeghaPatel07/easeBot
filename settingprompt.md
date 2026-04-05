To refine this prompt, we need to transition from a rough concept to a structured *Product Requirements Document (PRD)* or *Sprint Plan*. A high-quality prompt for a PM-AI should define the tech stack, the user interface (UI) requirements, and the logic for the "Tone-to-Prompt" engine.

Here is the refined version of your prompt:

---

### Refined Prompt: Product Manager Scenario

*Role:* You are a Senior Product Manager overseeing a team of AI Agents. 
*Project:* Implementation of "User Personalization Suite" (Voice, Tone, and Identity).

*Objective:* Implement three core features in the User Settings profile in parallel using a specialized agent-based workforce.

*Core Functionalities:*
1.  *Voice Selection Engine:* A dropdown/gallery in Settings allowing users to select specific TTS (Text-to-Speech) profiles for response playback.
2.  *Dynamic Tone Slider (The "Master Prompt" Engine):* * A UI component with sliders for specific tones (e.g., *Analytical, Friendly, Warm, Concise*).
    * *Logic:* The % values from these sliders must dynamically inject instructions into the System/Master Prompt to shift the AI’s linguistic style.
3.  *Identity & Greeting Logic:* An input field for "Nickname." When populated, the AI must prioritize this name in all greeting and sign-off sequences.

*Task for the PM:*
* *Team Composition:* Define a team of AI Agents (e.g., UI/UX Agent, Backend/API Agent, Prompt Engineer Agent, QA Agent).
* *Parallel Execution Plan:* Assign specific sub-tasks to each agent so they can work concurrently.
* *Technical Logic:* Briefly explain how the "Tone Slider %" translates into the LLM system instructions.

---

### How I would execute this as your PM

If you’d like to move forward with this, here is how I would assign your team to execute in parallel:

#### 1. The Team Assignments
| Agent | Responsibility |
| :--- | :--- |
| *Architect Agent* | Defines the state management (how the nickname and slider values are stored and passed to the API). |
| *UI/UX Agent* | Builds the Settings interface: the Voice gallery, the Tone sliders (0–100%), and the Nickname text field. |
| *Prompt Engineer Agent* | Develops the *Dynamic Prompt Template. (e.g., if Analytical is 80%, injects: *"Use data-driven logic and structured headers"). |
| *Voice/Media Agent* | Integrates the TTS API (like ElevenLabs or Azure Speech) and maps the "Voice Selection" IDs to the playback engine. |

#### 2. Parallel Workflow
* *Stream A (Frontend):* UI Agent builds the sliders and nickname input.
* *Stream B (Logic):* Prompt Engineer creates the "Weighting Table" for tones. 
* *Stream C (Integration):* Architect Agent ensures the "Nickname" variable is globally available to the prompt-builder.

#### 3. The "Tone Slider" Logic (The Secret Sauce)
Instead of simple keywords, the *Prompt Engineer Agent* will use a weighted instruction set:
* *If Analytical > 70%:* "Prioritize cold facts, use Markdown tables, and avoid exclamation marks."
* *If Friendly > 70%:* "Use conversational fillers (e.g., 'I see,' 'That makes sense') and inclusive pronouns."
* warm 
* enthusistic 
* heaser & list 
* emojis 
* friendly 
* message length 
* professional 
* candid 
* efficient 
* quirky 
* cynical 