# Nortex Reimbursements — the note

## What I understood the problem to be

The 25 minutes is not typing. It is *reconciliation*: deciding which of 17 items in
an inbox are claimable, which are the same bill twice, which belong to someone
else, and which lines of a hotel folio the company never pays for. The errors come
from the same place, and the two weeks of chasing Finance come from nobody being
able to see where the claim sits.

So the app is not a form with a file upload. It reads the trip's evidence, proposes
a settlement with the policy already applied, and shows the reasoning beside every
line. The employee checks it instead of assembling it. Every artefact hangs off the
Travel Request ID, which is what policy 1.1 asks for and what makes the trail hold.

## The judgement calls the pack is really asking about

Given this pack, a correct settlement is ₹27,318.04 claimed, ₹929.60 disallowed,
**₹26,388.44 net, ₹6,388.44 payable** after the ₹20,000 advance. Getting there means:

- The **failed-payment notice** (08) is not a receipt; the real receipt (09) is, and
  its forwarded copy (10) is the same bill — one ₹172 ride, claimed once.
- **Deepa's Uber** (13) is another person's expense from another trip: excluded under
  §4, not silently, but on the record with the reason.
- **Flights** are on the corporate card: recorded as "Company" rows for the audit and
  the economy-class check, reimbursed at zero.
- The hotel **voucher says "Pay at Hotel"** and the invoice says "Settled by Guest",
  so lodging is employee-borne — even though the request form estimated it as
  company-borne. The evidence beats the estimate.
- The **folio is split**: room + its tax (₹19,320, inside the ₹6,000 Tier-1 cap),
  in-room dining moved to meals (₹1,254.40, inside the ₹7,500 five-day cap), laundry
  and mini bar disallowed **with their share of the GST** (₹929.60) and shown on the
  form rather than dropped, which the template's own legend demands.
- The **customer dinner** is business entertainment, not the meal allowance: it needs
  attendee names and, above ₹2,000, prior approval from the Head of Department.
  Neither is in the inbox, so the app blocks filing until a human supplies them.
- The **approval chain follows the claimed value**: ₹26,388 crosses ₹25,000, so
  Reporting Manager then Head of Department, then Finance verification on every
  claim regardless of value. Where a claimant holds a level, that level is skipped.
- Three warnings the pack plants and the app raises rather than hides: only the
  Reporting Manager approved a ₹43,500 estimate that needed the HoD too; the
  ₹20,000 advance exceeds 60% of the employee-borne estimate; and 4 trip nights have
  only 3 nights of lodging behind them.

## Assumptions

Where the pack is silent I made a call and made it visible in the interface: the
travel request in the pack was never issued an ID, so the app issues `TRQ-2026-0001`
and back-dates the approval that did happen. Employee-borne estimate follows the
request form's "Borne By" column, which is what makes the advance look over the cap.
Tax on a consolidated bill is apportioned pro rata to each component. The missing
19 June night and the missing return airport transfer are flagged as gaps for the
employee to answer — the app never invents a line.

## What I built, and what I left out

Built: inbox reading (rules for the known senders, Gemini for photographed bills
with verified readings as a fallback so a demo never depends on a network call);
a pure policy engine covering §1–§5; a settlement workspace that mirrors the paper
form; approvals with approve / **send back with remarks** / reject; Finance
verification, payment-run dates and payable-vs-recoverable; an admin view where the
approval thresholds are editable and feed the engine; the filled `.xlsx` in the
company's own template with its formulas untouched; and an audit trail on
everything.

Left out on purpose: real SSO (a demo sign-in stands in), a live mailbox connection
(the pack's folder stands in), a drag-and-drop workflow builder, payroll and
banking integration, notifications, and multi-currency. Each is a seam, not a
rewrite — the sign-in is one file, the inbox is one function.

## Where it breaks

The parsers are written for these senders. A new format falls through to
"Not recognised" with a confidence score rather than a wrong number, which is the
right failure but still a failure. The duplicate key is merchant + amount + time +
bill number, so two genuine identical cab rides in the same minute would be
misread as one. The Excel template has a fixed number of rows per section; beyond
that the app writes a summarised overflow row instead of dropping lines. The
seed runs on every deployment, so redeploying resets the demo. And a claim's totals
are recomputed from its stored lines on every change, which is correct but would
need a snapshot table before anyone audited a year of them.
