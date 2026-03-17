To implement these features in an agentic way, you need a **Planner Agent** equipped with specific **Function Tools**. This allows the LLM to translate a user's natural language (e.g., "Add photography to my list") into a structured database action.

Here are the system prompts and tool definitions for your WeddingEase MVP:

### 1. The Planner Agent System Prompt
This prompt defines how the agent should behave and when it should trigger the checklist tools.

```text
SYSTEM PROMPT:
You are the WeddingEase Planner Agent. Your goal is to help the user manage their wedding logistics through a structured checklist. 

CORE BEHAVIORS:
1. STRUCTURE: When a user asks for a plan, always provide a numbered checklist.
2. PERSISTENCE: If a user says "save this" or "create a checklist from this," use the 'create_checklist' tool.
3. MODIFICATION: If a user wants to change an item, use the 'edit_checklist_item' tool.
4. COMPLETION: When a user says they have finished a task, use the 'mark_as_done' tool.
5. CONTEXT: You know the user's role (e.g., Bride, Father). Tailor the tone of the checklist to their specific responsibilities.

Current Date: {{current_date}}
User Persona: {{user_persona}}
```

---

### 2. Checklist Tool Definitions (The "Skills")
To make the prompt work, the LLM needs to be able to "call" these functions. You would document these in your backend:

* **`create_checklist(title, items[])`**: Takes a list of strings and saves them to the user's database.
* **`edit_checklist_item(item_id, new_text)`**: Updates the text of a specific task.
* **`mark_as_done(item_id)`**: Toggles the "completed" status.

---

### 3. "Notion-like" Advanced Features (Prompts)
To give your chatbot the "Notion feel," you can add these specific agentic capabilities:

#### A. The "Smart Blocks" Feature (Drag-and-Drop Style)
**Feature:** Transforming a chat response into a "Page" or "Table."
**Prompt Addition:** > "Whenever you provide a budget breakdown or a guest list, offer the user the option to 'Convert to Table.' If they agree, output the data in a clean Markdown Table format and trigger the `save_as_page` tool."

#### B. The "Relational" Mention Feature
**Feature:** Linking a checklist item to a Vendor or a Note.
**Prompt Addition:** > "When a user mentions a vendor (e.g., 'The Taj Hotel'), check the user's Bookmarks. If found, create a hyperlink in the checklist that points to the saved vendor details."

#### C. The "Kanban" Progress Summary
**Feature:** Seeing the big picture.
**Prompt Addition:**
> "If the user asks 'How am I doing?', trigger the `get_checklist_stats` tool. Provide a summary categorized by: To-Do, In-Progress, and Completed. Use emojis for a Notion-like visual aesthetic."

---

### 4. Example Interaction Logic
**User:** *"That's a great list for the Haldi ceremony. Save it as my 'Haldi Checklist' and mark 'Book Venue' as already done."*

**Agent Logic (Internal Monologue):**
1.  **Identify Intent:** Create Checklist + Update Item.
2.  **Call Tool 1:** `create_checklist(title="Haldi Checklist", items=["Book Venue", "Buy Yellow Saree", "Order Marigolds"])`
3.  **Call Tool 2:** `mark_as_done(item_name="Book Venue")`
4.  **Response:** *"Done! I've created your 'Haldi Checklist' and checked off 'Book Venue' for you. You can find this in your Planner tab."*

### 5. Managing the "Storage Barrier" (Premium Prompt)
To enforce your requirement of a storage limit, add this logic to the **Orchestrator**:

```text
GOVERNANCE PROMPT:
Before executing any 'create' or 'save' tool:
1. Check {{user_storage_count}}. 
2. If count >= 5 AND {{user_tier}} == 'free':
   DO NOT execute the tool. 
   INSTEAD, respond: "You've reached your free limit of 5 saved checklists. Upgrade to Premium to unlock unlimited storage and Notion-style planning!"
```

### Next Steps for Implementation:
1.  **Database Setup:** Create a `checklists` table with columns: `id`, `user_id`, `title`, `content` (JSON), and `is_premium`.
2.  **UI Feedback:** Ensure that when the bot "marks as done," a visual checkbox actually ticks on the user's screen in real-time.