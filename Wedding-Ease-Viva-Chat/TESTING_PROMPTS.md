# Viva — Manual Testing Guide

> Run `npm run dev` and open `http://localhost:5173` in your browser.
> Sign in with a test account before starting.

---

## TIER 0 — Quick Wins

### #2 Pin Conversations
| Step | Action | Expected |
|------|--------|----------|
| 1 | Create 3+ chat threads by sending messages | Threads appear in sidebar under "Recent Threads" |
| 2 | Hover over a thread → click `⋯` → click **Pin** | Thread moves to a new "Pinned" section at the top of the sidebar |
| 3 | Pin a second thread | Both pinned threads appear above regular threads |
| 4 | Hover pinned thread → `⋯` → **Unpin** | Thread moves back to Recent Threads in its date group |
| 5 | Refresh the page | Pinned threads persist (Firestore) |

---

### #4 Keyboard Shortcuts + Help Overlay
| Step | Action | Expected |
|------|--------|----------|
| 1 | Press `Ctrl + /` | Shortcuts overlay modal appears listing all shortcuts |
| 2 | Press `Escape` | Overlay closes |
| 3 | Press `Ctrl + Shift + N` | New chat starts, input clears, URL changes to `/` |
| 4 | Press `Ctrl + Shift + S` | Sidebar toggles open/closed |
| 5 | Click the **keyboard icon** in the header bar | Shortcuts overlay appears |
| 6 | Press `Escape` while AI is generating | Generation stops |

---

### #5 "Continue Generating" Button
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send a prompt that requests a very long response: `"Write me a complete 50-item wedding planning checklist with full descriptions for each item"` | AI generates a long response |
| 2 | If response gets truncated (ends mid-sentence) | A **"Continue generating..."** button appears below the message |
| 3 | Click "Continue generating..." | A follow-up message is sent ("Please continue from where you stopped") and AI continues |
| 4 | If response completes normally | No continue button shown (correct) |

---

### #6 Typing Indicator with Mode Name
| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **Planner** mode from the mode selector | Mode pill highlights |
| 2 | Send any message | Typing indicator shows **"Viva (Planner) is thinking"** with green-tinted dots |
| 3 | Select **Stylist** mode and send a message | Shows **"Viva (Stylist) is thinking"** with gold-tinted dots |
| 4 | Select **Auto** mode and send a message | Shows **"Viva is thinking"** (no mode label) |

---

### #7 Response Tone Modifiers
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send any message and wait for AI response | Response appears |
| 2 | Hover over the AI response bubble | Four tone chips appear: **Shorter**, **Longer**, **Simpler**, **More formal** |
| 3 | Click **"Shorter"** | A follow-up message is sent: "Rewrite your last response but make it shorter" → AI responds with condensed version |
| 4 | Click **"More formal"** on the new response | AI rewrites in formal tone |

---

## TIER 1 — High Impact

### #9 Voice Output (TTS)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Get any AI response | Response appears |
| 2 | Hover over the AI message → click the **speaker/play icon** | Browser reads the response aloud using Web Speech API |
| 3 | Click the **pause** icon while speaking | Speech pauses |
| 4 | Click **play/resume** | Speech continues |
| 5 | Click **stop** | Speech stops completely |
| 6 | Try with a different browser language setting | Voice should attempt to match locale |

---

### #10 Full-Text Conversation Search
| Step | Action | Expected |
|------|--------|----------|
| 1 | Create a few threads with different topics (e.g., "budget for venue", "flower arrangement ideas") | Threads appear in sidebar |
| 2 | Click the **search icon** in the sidebar header | Search input appears |
| 3 | Type `"venue"` | Thread titles matching "venue" appear |
| 4 | Type a word that exists in message content but NOT in thread titles (e.g., a specific word from an AI response) | After 400ms debounce, message-level search results appear showing **Thread Title > snippet** |
| 5 | Click a search result | Navigates to that thread and scrolls to the matching message (highlighted briefly) |
| 6 | Type fewer than 2 characters | Message search does NOT trigger (only title filter) |

---

### #12 Share Conversation Link
| Step | Action | Expected |
|------|--------|----------|
| 1 | Have a conversation thread with some messages | Thread exists |
| 2 | Hover thread → `⋯` → click **Share** | Link is copied to clipboard, toast shows success |
| 3 | Open the copied link in an **incognito window** (no login) | Read-only view of the conversation loads with title, messages, mode badges |
| 4 | Verify the shared view shows all messages with proper formatting | Messages render with markdown, timestamps |
| 5 | Try a random/invalid share ID in URL | Shows "not found" or "expired" message |

---

### #13 Streaming Markdown Rendering
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send: `"Give me a detailed comparison table of 5 wedding venues with pros and cons, formatted in markdown"` | Response starts streaming |
| 2 | Watch the response as it streams in | Markdown formatting (headings, bold, lists, tables) renders **progressively** as tokens arrive — NOT raw text that formats at the end |
| 3 | Send: `"List 10 tips with **bold** keywords and bullet points"` | Bold text and bullets render in real-time during streaming |

---

### #14 Message Pagination
| Step | Action | Expected |
|------|--------|----------|
| 1 | Create a thread with 35+ messages (send many short messages back and forth) | Messages exist in Firestore |
| 2 | Navigate away, then reload the thread | Only the latest ~30 messages load initially |
| 3 | Scroll to top of message list | A **"Load earlier messages"** button appears |
| 4 | Click the button | Older messages are prepended; scroll position is preserved |
| 5 | Keep clicking until all messages are loaded | Button disappears when no more messages exist |

---

## TIER 2 — Medium Impact

### #19 Message Branching (Edit History)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send a message like `"Suggest rustic wedding themes"` | AI responds |
| 2 | Click the **edit icon** on your message | Input field appears with original text |
| 3 | Change text to `"Suggest modern wedding themes"` and press Enter | AI generates a new response to the edited message |
| 4 | Check the user message | Left/right **chevron arrows** and **"1/2"** indicator appear |
| 5 | Click the **left arrow** | Original branch restores (rustic themes response) |
| 6 | Click the **right arrow** | Returns to edited branch (modern themes response) |
| 7 | Edit the same message again with `"Suggest boho wedding themes"` | Indicator shows **"1/3"**, all 3 branches navigable |

---

### #20 Checklist Due Dates + Overdue Alerts
| Step | Action | Expected |
|------|--------|----------|
| 1 | In **Planner** mode, send: `"Create a checklist: Book venue by April 1, Order flowers by April 15, Send invitations by May 1"` | Checklist created with due dates auto-assigned |
| 2 | Open the checklist from **Planner** sidebar | Items show due dates, sorted by deadline |
| 3 | Hover an item → click the **calendar icon** | Date picker appears inline |
| 4 | Set a due date in the **past** (e.g., yesterday) | Item highlights in **red** with "Overdue" label and ⚠ icon |
| 5 | Check the **Planner** sidebar item | Badge shows overdue count (red number) |
| 6 | Mark the overdue item as done | Red highlighting disappears, item moves to bottom |

---

### #21 Archive Conversations
| Step | Action | Expected |
|------|--------|----------|
| 1 | Hover a thread → `⋯` → click **Archive** | Thread disappears from main list |
| 2 | If it was the active thread | Navigates to home `/` |
| 3 | Scroll to bottom of sidebar | Collapsible **"Archived (1)"** section appears |
| 4 | Click the "Archived" header | Section expands showing the archived thread (slightly transparent) |
| 5 | Hover the archived thread → `⋯` → **Unarchive** | Thread moves back to the main list |
| 6 | Archive a thread, then **refresh the page** | Thread stays archived (persisted in Firestore) |

---

### #22 Conversation Tags
| Step | Action | Expected |
|------|--------|----------|
| 1 | Hover a thread → `⋯` → click **Tags** | Inline tag picker appears with 10 color-coded presets (Venue, Catering, Budget, Style, Attire, Music, Flowers, Photo, Guest List, Other) |
| 2 | Click **"Venue"** and **"Budget"** | Both tags get ring highlight; colored pills appear below the thread title |
| 3 | Click **"Venue"** again | Tag is removed from that thread |
| 4 | Tag 2-3 different threads with different tags | Tags display correctly on each |
| 5 | Look for **"Filter by Tag"** section below threads | Tag filter pills appear |
| 6 | Click **"Venue"** in the filter bar | Only threads tagged "Venue" are shown |
| 7 | Click **"Clear"** button | Filter resets, all threads visible |
| 8 | Refresh the page | Tags persist |

---

## TIER 3 — Domain Differentiators

### #25 Budget Tracker Dashboard
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Budget** in the sidebar Quick Actions | Budget view opens |
| 2 | First visit: enter total budget (e.g., `50000`) → click **Get Started** | Dashboard appears with summary bar showing $50,000 total, $0 spent, $50,000 remaining |
| 3 | Click **Add Category** → enter "Venue" with allocated $15,000 | Category card appears with progress bar |
| 4 | Click the Venue category to expand it | Line items section appears (empty) |
| 5 | Add a line item: "Grand Hotel deposit", $5,000, vendor "Grand Hotel" | Item appears in the list |
| 6 | Toggle the **paid** checkbox on the line item | "Spent" updates to $5,000 (only counts paid items) |
| 7 | Add another unpaid item: "Final payment", $10,000 | Spent stays at $5,000 (unpaid not counted) |
| 8 | Add category "Catering" with $10,000 | Second card appears |
| 9 | Check the summary bar | Total allocated and spent update correctly |
| 10 | Delete a line item | Item removed, spent recalculated |

---

### #26 Collaborative Planning (Invite Partner)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Collaborate** in sidebar Quick Actions | Invite Partner view opens |
| 2 | No collaborators yet | Empty state: "Plan together" message shown |
| 3 | Enter an invalid email (e.g., "notanemail") → click Send | Error message: "Please enter a valid email address" |
| 4 | Enter your own email | Error: "You cannot invite yourself" |
| 5 | Enter a valid email (e.g., `partner@example.com`) → click **Send Invite** | Success message with invite link; collaborator appears in list with "Pending" badge (amber) |
| 6 | Click **Copy Link** | Link copied to clipboard |
| 7 | Try inviting the same email again | Error: "This email has already been invited" |
| 8 | Click **X** on the collaborator | Collaborator removed from list |

---

### #28 Timeline Visualization
| Step | Action | Expected |
|------|--------|----------|
| 1 | First, create checklist items with due dates and calendar events (use Planner mode) | Data exists |
| 2 | Click **Timeline** in sidebar Quick Actions | Timeline view opens |
| 3 | Check the stats bar | Shows Total milestones, Completed, Upcoming, Overdue counts |
| 4 | Timeline renders as vertical layout | Colored dots on a line: green=completed, blue=upcoming, red=overdue, amber=today |
| 5 | Entries grouped by month | Month headers like "March 2026", "April 2026" |
| 6 | Each entry shows | Date, title, "Task"/"Event" badge, status indicator |
| 7 | If you have a wedding date in your profile | Special pink **"Wedding Day"** marker with heart icon and countdown |
| 8 | If no items have dates | Empty state message appears |

---

### #29 Notification / Reminder System
| Step | Action | Expected |
|------|--------|----------|
| 1 | First, create checklist items with **past due dates** | Overdue items exist |
| 2 | Click **Alerts** in sidebar Quick Actions | Notification panel opens |
| 3 | Overdue notifications auto-generate | One notification per overdue checklist item, grouped under "Today" |
| 4 | Unread notifications show | Blue dot indicator, blue-tinted background |
| 5 | Click a notification | Marked as read (blue dot disappears, background changes) |
| 6 | Click **"Mark all read"** | All notifications lose unread indicators |
| 7 | Hover a notification → click **X** | Notification fades out and is deleted |
| 8 | Revisit the page | No duplicate notifications created for same overdue items |

---

### #31 Comparison Tables
| Step | Action | Expected |
|------|--------|----------|
| 1 | Send: `"Compare 4 wedding photographers: name, price, rating out of 5, style, and availability. Format as a markdown table."` | AI responds with a markdown table |
| 2 | Table renders as an **interactive styled table** | Rounded container, alternating row colors, header with bg-[#f4f4ed] |
| 3 | Click a column header (e.g., "Price") | Rows sort by that column; arrow indicator (▲/▼) appears |
| 4 | Click "Price" again | Sort reverses |
| 5 | Check the "Price" column | Lowest price highlighted in green |
| 6 | Check the "Rating" column | Highest rating highlighted in green |
| 7 | Click **"Save to Planner"** below the table | Planner mode activates with the table content pre-filled |
| 8 | On a narrow screen | Table scrolls horizontally |

---

### #32 Progress Dashboard
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Progress** in sidebar Quick Actions | Dashboard opens |
| 2 | **Wedding countdown** | If wedding date is set: shows "X days until your wedding" with date. If not: shows prompt to set date |
| 3 | **Readiness score ring** | SVG circular ring with percentage (composite of checklist, budget, calendar, threads) |
| 4 | **Category cards (2x2)**: Planning | Shows X/Y tasks complete with mini progress bar |
| 5 | **Category cards**: Budget | Shows $X of $Y spent, or "Not set up" if no budget |
| 6 | **Category cards**: Calendar | Shows X events scheduled |
| 7 | **Category cards**: Conversations | Shows X threads |
| 8 | **"What to do next"** section | Up to 3 suggestions (e.g., "You have N overdue tasks", "Set up your budget", "Save important dates") |
| 9 | Complete more tasks / add budget / create events | Score updates on next visit |

---

### #33 Shopping List Implementation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Shopping** in sidebar Quick Actions | Shopping Lists view opens |
| 2 | Click **"New List"** → enter title "Wedding Decor" → confirm | List card appears with 0 items, $0.00 total |
| 3 | Click the list to expand | Empty items section with "Add Item" button |
| 4 | Add item: name="Fairy Lights", price=30, link=`https://amazon.com/lights` | Item appears with $30.00, clickable link |
| 5 | Add another: name="Candles", price=15 | Two items, total shows $45.00 |
| 6 | Check the **purchased checkbox** on Fairy Lights | Item gets strikethrough, moves to bottom, purchased count updates |
| 7 | Check the **summary stats** bar | Shows "2 Total Items", "$45.00 Estimated", "1 Purchased" |
| 8 | Click the **link icon** on an item | Opens the URL in new tab |
| 9 | Delete an item | Removed, totals update |
| 10 | Delete the entire list | List card disappears |

---

### #34 Saved Items / Bookmarks
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Saved** in sidebar Quick Actions | Saved Items view opens |
| 2 | First visit: empty state | "No saved items yet" with bookmark icon |
| 3 | Click the **"+"** button | Add form opens with text area, category picker, optional note |
| 4 | Paste a snippet: "The Grand Hotel offers packages starting at $5000", select **Vendor**, add note "Compare with other venues" → Save | Item card appears with blue "Vendor" badge, snippet, note |
| 5 | Add another item with category **Decor** | Second card with pink "Decor" badge |
| 6 | Click the **category filter pills** → select **Vendor** | Only Vendor items shown |
| 7 | Click **All** | All items visible |
| 8 | Type in the **search bar** | Items filter by text content |
| 9 | Click the **category badge** on a saved item | Category picker dropdown appears inline |
| 10 | Select a different category (e.g., change "Vendor" to "Tip") | Badge color and label update immediately |
| 11 | Click the **note area** → edit the note | Note updates on Enter/Save |
| 12 | Hover an item → click **trash icon** | Item deleted |

---

## Quick Smoke Test (5 minutes)

Run through these steps for a fast overall verification:

1. **Open app** → sign in → sidebar visible with Quick Actions
2. **New chat** → send `"Plan my wedding in 3 months"` in Planner mode → watch streaming markdown render
3. **Check typing indicator** → shows "Viva (Planner) is thinking" with green dots
4. **Tone modifier** → hover AI response → click "Shorter" → AI rewrites
5. **Pin** the thread → verify it moves to Pinned section
6. **Tag** it as "Budget" → colored pill appears
7. **Archive** it → verify it moves to Archived section → Unarchive
8. **Share** the thread → open link in incognito → verify read-only view
9. **Planner** sidebar → check checklist with due dates → set one overdue
10. **Budget** sidebar → set total $50K → add category → add line item → toggle paid
11. **Shopping** sidebar → create list → add items → mark purchased
12. **Saved** sidebar → add a bookmark → change category → filter
13. **Timeline** sidebar → verify timeline entries from checklists/events
14. **Progress** sidebar → verify readiness score and suggestions
15. **Alerts** sidebar → verify overdue notifications generated
16. **Collaborate** sidebar → invite a test email → verify pending status
17. **Keyboard** → press `Ctrl+/` → overlay appears → `Escape` closes
18. **Search** → type a word from a message → verify message-level results
19. **Edit message** → change it → navigate branches with arrows
20. **TTS** → hover AI message → click play → hear speech

---

*Generated: 2026-03-21*
