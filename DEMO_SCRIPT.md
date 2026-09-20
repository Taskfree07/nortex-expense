# Screen recording script — 4 minutes

Before you start: `npm run setup` (resets to a clean demo), then `npm run dev`.
Have the browser at `http://localhost:3000`, zoom 100%, and close other tabs.

---

**0:00 — What the problem is** *(on the sign-in page)*

> "Nortex employees spend 25 minutes filling a settlement form by hand from their
> inbox. Chaitanya has just got back from Bengaluru. The approvals, the tickets,
> four cab receipts, a hotel bill and a customer dinner are all in his mail — along
> with a failed payment notice, a duplicate, a colleague's ride and a promo."

Click **Chaitanya Reddy**.

**0:25 — The trip**

> "Every trip starts with an approved request, and everything afterwards is tracked
> against its ID. Here is the Bengaluru trip: approved by his manager, ₹20,000
> advance drawn, due to be settled within seven days of return."

Open **TRQ-2026-0001**. Point at the advance and the due date.

**0:45 — The moment** — click **Read my inbox**

> "That read 15 emails and two photographed bills, applied the travel policy, and
> drafted the form. This is the part that was 25 minutes."

**1:00 — Walk the ledger** *(scroll slowly)*

- Lodging: "Room plus its tax, ₹19,320. ₹5,750 a night is inside the Tier-1 cap."
- "The folio also had laundry and a mini bar. **Not** dropped — shown as disallowed,
  with their share of the GST, because the form's own legend demands that."
- "In-room dining moved out of lodging into meals, where the daily cap applies."
- Transport: "Both flights are on the corporate card, so they are recorded but
  reimbursed at zero. Four cab rides — and only four."
- Other: "The customer dinner is business entertainment, not the meal allowance."

**1:50 — What it refused to do** *(the Policy checks panel)*

> "Two blocking checks. The dinner is over ₹2,000, which needs prior approval from
> the Head of Department, and business entertainment needs the names of who was at
> the table. Neither is in the inbox, so it will not let him file."

Then scroll to **What was read from the inbox**:

> "And this is why I trust it: every message, what it was read as, and what happened
> to it. The failed payment notice, the forwarded duplicate, the colleague's
> Chennai ride, the marketing mail — each set aside with a reason and a policy clause."

**2:30 — Clear the checks and file**

Type the attendees, clear the second check with a remark, press **File the settlement**.

> "₹26,388.44 net after ₹929.60 disallowed, less the ₹20,000 advance: ₹6,388.44 payable."

**2:50 — Approvals** — switch person → **Suresh Iyer**

> "The chain follows the value. ₹26,388 crosses ₹25,000, so it is the manager and
> then the Head of Department. The approver gets a brief: what is worth checking,
> including that the original estimate needed an approval it never got."

Approve. Switch to **Meera Krishnan**, approve.

**3:20 — Finance** — switch to **Ravi Menon**

> "Finance verifies every claim regardless of value, and the payment run is the
> 10th and the 25th — so the employee can see the date instead of chasing it."

Approve, show **Payments**, switch to **Kavitha Balan**, release. Show the claim as **Paid**.

**3:30 — It is not a fixture** *(the part that matters)*

Sign in as **Imran Qureshi**, raise a Hyderabad trip, and drop his own five files on it.

> "Nothing here comes from the pack. Same pipeline, and it catches the same kinds
> of things: the duplicate cab, a colleague's ride, and a hotel at seven thousand
> a night against a six thousand cap - three thousand disallowed, shown on the form."

**3:40 — The form and the admin view**

Click **Download the form**, open the `.xlsx`:

> "It fills Nortex's own template and leaves the formulas alone — the sheet computes
> its own totals and lands on the same numbers."

Then **Categories** as an admin:

> "Domestic travel runs six stages, a conference claim runs three, and the value at
> which each approver joins is editable here — it feeds the same engine."

**3:55 — Close**

> "The policy engine is pure and tested against this pack by hand: 12 tests over the
> classification, the folio split and the settlement arithmetic. What I left out and
> where it breaks is in the note."
