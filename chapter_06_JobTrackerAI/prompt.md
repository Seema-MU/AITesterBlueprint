Create a local-first Job Tracker as a single-page React application scaffolded with Vite. All data must persist in the browser using IndexedDB (use the `idb` library for a cleaner async API). No backend or authentication is needed.

**Data Model — Each job card stores:**

- Company name (text, required)
- Job title / role (text, required)
- LinkedIn job URL (URL, clickable)
- Resume used (text / dropdown of previously used resume names, e.g., "SDE_Resume_v3", "QA_Lead_Resume")
- Date applied (auto-set on creation, editable)
- Salary range (optional text, e.g., "₹25-30 LPA" or "$150-180K")
- Notes (optional textarea for recruiter name, referral info, etc.)
- Status (maps to Kanban column)
**Kanban Columns (drag-and-drop between them):**

1. **Wishlist** — Saved jobs I haven't applied to yet
2. **Applied** — Application submitted
3. **Follow-up** — Followed up with recruiter / referral
4. **Interview** — Currently in interview rounds
5. **Offer** — Received an offer
6. **Rejected** — Got a rejection
**Core Features:**

- Drag-and-drop cards between columns (use `@dnd-kit/core`  or `react-beautiful-dnd` )
- Add new job via a modal/slide-over form
- Edit any card inline or via modal
- Delete a card with confirmation
- Card shows: company name, role, resume tag, days since applied, and a clickable LinkedIn icon/link
- Column headers show the count of cards in each column
- Search/filter bar to find jobs by company name or role
- All CRUD operations persist instantly to IndexedDB
**Nice-to-Have (implement if straightforward):**

- Light/dark mode toggle
- Export all data as JSON for backup
- Import JSON to restore data
- Sort cards within a column by date (newest/oldest)
**Tech Stack & Constraints:**

- React 18+ with functional components and hooks
- Vite for build tooling
- Tailwind CSS for styling (clean, minimal UI)
- `idb`  npm package for IndexedDB wrapper
- No external database, no API calls — 100% local
- Responsive layout (usable on laptop + tablet)
**UI/UX Notes:**

- Clean, professional look — think Linear or Trello-minimal
- Each column should be scrollable independently
- Cards should have subtle color coding or left-border accent per status
- The form should validate required fields before saving
