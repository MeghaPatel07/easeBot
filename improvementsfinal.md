# NOT SIGNINED USER 
- in not loggedin session for guest show the limits and usagee
- give baseic quick actions for the guest sessions with functionality alligned for the guest user 
- user should be to mane neew chaneg and thus stoing the otheer guest based chats for that active session . 


# General 
- there wont be invpoce section
- if user has bought the package then the days of that package validity will be from ythat buying datye and the 24 hr of token usage will be countedd from that time of bought . 
- on the deletion of the chats , that image associated with that chat will also be deleted from firebase . Same for the dleete all chats 
- give confirmaion modals for all delete actions , logout actions . 
- remove the help from the sidebar . 
- make the helo and feedback page with the ticket support sysyatem and feedback part . 
- all the titles will bbe in titleCase in all the sections of the site 
- the eextra limitpart will be available after buying the package use the claude referrence for it 
- the pricing page should be shownif the user is loggedin , if the user is not loggedin then show the signin/signup page like https://claude.ai/login?plan=max&returnTo=%2Fupgrade%3FrecommendedPlan%3Dmax%26src%3Dplan_intent.

- take the reference of claude for the upgrade package if the user has exswiitng package , change package if the user has exisiting package . for that 
 following is just the example of how the subscription based upgradation works in claude , 
---

## 1. Core Upgrade Logic: "The Credits Carryover"
When a user upgrades, Claude does not simply "restart" the month. It uses **Prorated Credit Logic**:
* **Balance Conversion:** The remaining value of your current month (e.g., if you are 15 days into a $20 Pro plan, you have $10 "credit") is applied to the new plan.
* **Instant Provisioning:** Usage limits (e.g., the jump from Pro to Max 5x) are refreshed immediately upon successful payment.
* **Billing Alignment:** Your new billing date typically resets to the day you upgraded to the higher tier.

---

## 2. Upgrade Use Cases & Workflows

### Use Case A: Free Tier $\rightarrow$ Pro ($20/mo$)
* **Trigger:** User hits the "Daily Message Limit" or wants access to **Claude Code** (the terminal agent).
* **The Flow:**
    1.  User clicks "Upgrade" in the sidebar.
    2.  Payment is processed for $20.
    3.  **Immediate Effect:** The "Rate Limit" banner disappears. The user gains access to the **Opus 4.6** model and **Claude Cowork** (the computer-use agent).
    4.  **Data:** Existing chats remain; "Pro" badging appears on the avatar.

### Use Case B: Pro ($20/mo$) $\rightarrow$ Max ($100/mo$ or $200/mo$)
* **Trigger:** A developer or "power user" hitting the Pro limit within 5-hour windows.
* **The Flow:**
    1.  User selects "Manage Subscription" $\rightarrow$ "Upgrade to Max."
    2.  **Logic:** System calculates: $Cost_{New} - (Value_{Remaining})$. 
    3.  **Example:** If you have $10 left of Pro value and upgrade to Max 100 ($100/mo$), you pay $90 today.
    4.  **Benefit:** Usage limits increase to **5x (Max 100)** or **20x (Max 200)**. User gains "Priority Lane" access (zero latency during peak hours).

### Use Case C: Individual Pro $\rightarrow$ Team Standard/Premium
* **Trigger:** A user wants to share "Projects" or "Shared Knowledge Bases" with colleagues.
* **The Flow:**
    1.  User selects "Create Team."
    2.  The individual Pro account is **converted** into the first seat of the Team.
    3.  The remaining $20 (or prorated amount) is credited toward the Team's first invoice.
    4.  **Admin Logic:** The user becomes the "Primary Admin" and can invite members.

### Use Case D: Standard Team Seat $\rightarrow$ Premium Team Seat ($150/mo$)
* **Trigger:** An engineer on a general team needs the **Claude Code** terminal tool and the **1M token context window**.
* **The Flow:**
    1.  Admin goes to "Member Management."
    2.  Admin toggles a specific user from "Standard" to "Premium."
    3.  **Prorated Charge:** The Admin's card is charged for the difference for the remainder of the month.
    4.  **Instant Tooling:** The user can immediately authenticate their CLI with the new Premium permissions.

---

## 3. Summary of Plan Logic (2026)

| Current Plan | Target Plan | Main Benefit | Logic Type |
| :--- | :--- | :--- | :--- |
| **Free** | **Pro** | Claude Code + High Usage | New Sub |
| **Pro** | **Max 100/200** | 5x–20x Usage + Early Feature Access | Prorated Upgrade | 

---

## 4. Exceptional Logic (Edge Cases)
* **Downgrading:** If a user moves from Max back to Pro, the "Max" benefits typically remain active until the end of the current billing cycle, with no refund for the difference.
* **Annual to Monthly:** Not allowed mid-cycle; the user must wait for the annual term to expire.
* **API vs. Subscription:** These remain **separate**. Upgrading a web subscription does not provide free credits for the API (Claude Console), though "Claude Code" usage in the terminal is covered by the Pro/Max/Team Premium subscriptions.


