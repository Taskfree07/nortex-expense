# Nortex Reimbursements — the note

**Live:** https://nortex-expense.vercel.app · **Code:** https://github.com/Taskfree07/nortex-expense

## What I understood the problem to be

The 25 minutes is not typing, it is *reconciliation*: deciding which of 17 things in
an inbox are claimable, which are the same bill twice, which belong to someone else,
and which lines of a hotel folio the company never pays for. The errors come from the
same place, and the fortnight of chasing Finance comes from nobody being able to see
where the claim sits. So this is not a form with a file upload: it reads the trip's
evidence, proposes a settlement with the policy already applied, and shows the
reasoning beside every line. Everything hangs off the Travel Request ID (policy 1.1).

## The judgement calls

A correct settlement here is **₹26,388.44 net, ₹6,388.44 payable** after the ₹20,000
advance. Getting there means: the failed-payment notice is not a receipt and the
forwarded copy is the same ₹172 ride; a colleague's Uber from another trip is
excluded under §4, on the record with its reason; flights on the corporate card are
recorded as Company rows and reimbursed at zero. The hotel voucher says "Pay at
Hotel" and the invoice "Settled by Guest", so lodging is employee-borne — the
evidence beats the request form's estimate. The folio is split four ways: room and
its tax (₹19,320, inside the ₹6,000 Tier-1 cap), in-room dining moved to meals,
and laundry and mini bar disallowed **with their share of the GST** (₹929.60) and
*shown* on the form, as the template's own legend demands. The customer dinner is
business entertainment, needing attendee names and — above ₹2,000 — prior HoD
approval; neither is in the inbox, so filing is blocked until a person supplies them.
The approval chain follows the claimed value: ₹26,388 crosses ₹25,000, so manager
then HoD, then Finance on every claim. Three things the app flags rather than hides:
a ₹43,500 estimate that only the manager approved, an advance above the 60% ceiling,
and four trip nights with three nights of hotel behind them.

## Assumptions

The pack's request was never issued an ID, so the app issues one and back-dates the
approval that did happen. Employee-borne estimate follows the form's "Borne By"
column, which is what puts the advance over its cap. Tax on a consolidated bill is
apportioned pro rata. Gaps — the missing night, the missing return transfer — are
flagged for the employee to answer; the app never invents a line.

## Built, and left out

Evidence arrives two ways — the employee drags their own trip's emails, bill photos
and PDFs onto it, or the sample trip loads the inbox that ships with the app — both
through one pipeline: rules for the known senders, Gemini for photographed bills,
with verified readings as a fallback so a demo never depends on a network call. Then
a pure policy engine covering §1–§5; a settlement workspace shaped like the paper
form; approve / **send back with remarks** / reject; Finance verification, payment-run
dates, payable-vs-recoverable; an admin view whose approval thresholds feed the
engine; the filled `.xlsx` in Nortex's own template with its formulas untouched; and
an audit trail throughout.

Left out deliberately: real SSO (a demo sign-in stands in), a live mailbox connection,
a workflow builder, payroll and banking integration, notifications, multi-currency.
Each is a seam rather than a rewrite — the sign-in is one file.

## Where it breaks

The parsers are written for these senders; a new format falls through to "not
recognised" with a confidence score rather than a wrong number — the right failure,
still a failure. Duplicates reconcile on merchant, amount, date and bill number
(policy 5.3), so two genuine identical cab rides on one day would read as one.
Uploaded files are base64 in the database row, which is fine at a few hundred KB a
trip and wrong at volume. Gemini's free tier allows 20 requests a day, after which
the reader quietly demotes to its stored readings. The seed runs on every deployment,
so redeploying resets the demo.
