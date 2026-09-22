# Code structure

What every folder and file does, and how a click travels through them.

## The one idea to hold

Data moves one way, through five layers. Each layer only calls the one below it.

```
  .eml files, bill photos, PDFs
            │
            ▼
  src/lib/ingest/      read them: classify, extract, find duplicates, spot someone else's
            │           (src/lib/ai/ reads the photographs)
            ▼
  src/lib/policy/      judge them: claim lines, disallowances, flags, approval chain
            │           PURE - no database, no network, so it is fully testable
            ▼
  src/lib/services/    keep them: save, submit, approve, pay, write the audit trail
            │
            ▼
  src/app/             show them: a page per role, and server actions for every click
            │
            ▼
  src/lib/excel/       hand them back: Nortex's own .xlsx, its formulas untouched
```

If you know which layer a question belongs to, you know which folder to open.

---

## The tree

```
nortex-expense/
├── data/pack/                  the take-home pack: the specification and the sample trip
├── prisma/                     database schema and the seed
├── scripts/                    tooling and the checks used while building (not part of the app)
├── src/
│   ├── app/                    Next.js routes: pages, server actions, two API routes
│   │   ├── (app)/              every signed-in page, sharing one sidebar layout
│   │   ├── api/                file downloads: the .xlsx and bill images
│   │   ├── sign-in/            pick who you are
│   │   ├── actions.ts          every mutation the interface can make
│   │   ├── globals.css         design tokens and the ledger styles
│   │   ├── layout.tsx          <html>, fonts
│   │   └── page.tsx            "/" - sends you to sign-in or the dashboard
│   ├── components/             reusable interface pieces, most of them forms
│   └── lib/                    everything that is not a screen
│       ├── ingest/             layer 1 - reading evidence
│       ├── ai/                 layer 1 - reading photographed bills with Gemini
│       ├── policy/             layer 2 - the policy engine
│       ├── services/           layer 3 - persistence and workflow
│       ├── excel/              layer 5 - the settlement workbook
│       ├── __tests__/          the test suite
│       └── (shared helpers)    money, dates, db, session, ui
├── README.md                   how to run it
├── NOTE.md                     the one-page note for the submission
├── DEMO_SCRIPT.md              the recording script
└── (config files)              next, vercel, vitest, tsconfig, prettier, env
```

---

## `data/pack/` — the specification

Nothing here is written by us. It is the pack as issued, and the app reads it at runtime.

| File | What it is | Who reads it |
|---|---|---|
| `PROBLEM_STATEMENT.md` | The brief | People |
| `expense_policy.md` | NTX-HR-POL-11, the travel policy | People; shown verbatim on the admin Policy page |
| `employee_master.csv` | The nine employees and who reports to whom | `prisma/seed.ts` |
| `sample_emails/01…15.eml` | Chaitanya's Bengaluru trip inbox, traps included | `ingest/pipeline.ts` (`ingestPack`) |
| `receipts/dinner_bill_18jun.png` | The customer dinner, photographed | `ai/receipt-reader.ts` |
| `receipts/hotel_invoice_1188.png` | The hotel folio, photographed | `ai/receipt-reader.ts` |
| `Travel_Expense_Forms_Template.xlsx` | Nortex's own settlement form | `excel/export.ts` fills it |

`next.config.ts` bundles this folder into the deployment, because it is read at runtime.

---

## `prisma/` — the database

### `schema.prisma`
Nine tables. It runs on SQLite locally and Postgres in production **from this one file**,
which is why it avoids enums and JSON columns (the only things that differ between the two).

| Model | Holds | Key point |
|---|---|---|
| `Employee` | The employee master | `managerCode` builds the reporting line the approval chain walks |
| `Category` | Domestic travel, Conference, General | Stages, approver thresholds and rules as data an admin can change |
| `TravelRequest` | A trip, `TRQ-2026-0001` | Everything hangs off this ID (policy 1.1) |
| `Document` | One email, bill photo or PDF | The **record** — claim lines are derived from these |
| `Claim` | A settlement, `CLM-2026-000001` | Totals are recomputed from its lines, never trusted as stored |
| `ClaimLine` | One row on the settlement form | `paidBy` is the word the Excel template SUMIFs on |
| `ApprovalStep` | One approver's decision | Used for both requests and claims |
| `Flag` | One policy verdict | Carries its clause and its severity: BLOCK, WARN or INFO |
| `AuditEvent` | Who did what, when | Written on every change |

### `seed.ts`
Loads the nine employees from the CSV, creates the three categories, and creates
Chaitanya's approved Bengaluru trip with its manager approval and ₹20,000 advance.
**It deliberately does not load the inbox** — reading the inbox is what the app does.
Runs on `npm run setup`, and on every Vercel deployment.

---

## `src/lib/ingest/` — layer 1, reading evidence

### `types.ts`
The shapes everything else agrees on. `RawEmail` is an email as it arrives.
`Extraction` is what was read from it (amounts, dates, folio lines, rider name…).
`ParsedDocument` is the finished result the engine consumes. `Classification`
names what a document is: `CAB_RECEIPT`, `HOTEL_INVOICE`, `PAYMENT_FAILED`,
`THIRD_PARTY_EXPENSE`, `PROMOTION` and the rest.

### `eml.ts` — `parseEml()`
A small reader for `.eml` files: headers, the plain-text body, and attachments.
Handles both the pack's attachment placeholders (`[ATTACHMENT: see receipts/…]`)
and real base64-encoded attachments. Written by hand because a general MIME
library would treat the pack's placeholders as broken attachments.

### `parsers.ts` — `parseEmail()`, `fingerprint()`, `markDuplicates()`
One rule per known sender: Uber, MakeMyTrip flight and hotel, the hotel's tax
invoice, Finance's advance, the approval thread, marketing mail, and a bill the
employee mailed to themselves. Each rule classifies the email and extracts its
fields. Three safety nets live here too:

- **Ownership** (`applyOwnership`) — "Thanks for riding, Deepa" on Chaitanya's
  claim is excluded as someone else's expense (policy 4).
- **Fingerprint** — merchant, amount, date and bill number (policy 5.3). No clock
  time: the same bill arriving by email and as a photo gives two different times.
- **Duplicates** (`markDuplicates`) — the earliest copy is kept, later ones point at it.

### `pipeline.ts` — `ingestPack()`, `ingestUploads()`, `ingestEmail()`
The two ways in, joined into one path:

- `ingestPack` reads the sample trip's 15 emails (only offered on `TRQ-2026-0001`).
- `ingestUploads` reads whatever the employee drops on their own trip: `.eml`,
  photos, PDFs. Duplicates are checked against what is already on the trip.

Both return the same `ParsedDocument`, so the engine cannot tell them apart.
Emails are read in parallel, which keeps an import inside Vercel's time limit.
A bill nothing can read is marked `needsReview` instead of being guessed at.

## `src/lib/ai/` — reading photographed bills

### `receipt-reader.ts` — `readReceiptImage()`, `readReceiptBytes()`, `verifiedReading()`
Sends a bill image or PDF to Gemini and asks for JSON (merchant, date, line
items, tax, total). Built to fail safely:

- **A list of models**, not one name — Google retires names for new projects.
  It moves on when a model is retired, forbidden, rate-limited or busy, and
  remembers the one that answered.
- **A 30-second budget per bill**, so a slow model cannot take the page down.
- **Verified readings** of the pack's two bills, used when the model is unavailable.
  The settlement comes out identical either way.
- **Tax and total rows are dropped** from the model's line items — it once
  returned "CGST 6%" as a charge and the claim paid the GST twice.

Rules read the emails; the model only reads what rules cannot — a photograph.

---

## `src/lib/policy/` — layer 2, the policy engine

### `config.ts` — the policy as data
Every number in NTX-HR-POL-11, each traceable to its clause: lodging caps by
city tier, meal caps, the ₹2,000 entertainment threshold, the 60% advance ceiling,
the 7-day window, the approval matrix, and the never-reimbursed list (laundry,
mini bar, alcohol…). Plus the small functions that apply them: `classifyCity`,
`matchNonReimbursable`, `isFolioMeal`, `isTaxOrTotalRow`, `requiredApprovalRoles`.

**This file is imported by the browser too** — the travel request form checks the
same caps live, so what the employee sees and what the server enforces cannot drift.

### `engine.ts` — `runPolicyEngine()`, `computeTotals()`
The heart of the app, and **pure**: a trip plus its documents in; claim lines,
flags and totals out. No database, no network.

- `buildLodgingLines` splits a hotel folio: room and its tax into Lodging, food into
  Meals, laundry and mini bar into Non-reimbursable **with their share of the GST**,
  shown rather than dropped. Tariff above the city cap is disallowed.
- `buildConveyanceLine`, `buildMealLine`, `buildEntertainmentLine`, `buildFlightLines`
  handle the other kinds. Flights on the corporate card become Company rows at ₹0.
- The `check…` functions raise flags: dates outside the trip, a missing proof, the
  meal cap, a missing night of lodging, a missing return transfer, the advance
  ceiling, and an approval the original request never got.
- `computeTotals` produces gross, disallowed, net, advance, payable and recoverable.

### `approvals.ts` — `resolveApprovalChain()`
Turns the roles the matrix asks for into actual people by walking the reporting
line in the employee master. Applies policy 2.2: if the claimant holds a level,
that level is skipped. Adds Finance verification and payment release on every claim.

### `guidance.ts` — `resolutionFor()`
Decides **who acts** on each flag, which the engine does not. A flag is cleared
by a note from the employee, clears itself when they do something (record the
attendees, price the bill), or is simply written down for the approver.
This is what turns "six boxes to fill in" into "2 need you, 4 are for your approver".

---

## `src/lib/services/` — layer 3, workflow

### `claim-service.ts`
Everything that happens between the inbox and the bank transfer. The engine
decides what is true; this file decides what is stored and who is asked next.

| Function | Does |
|---|---|
| `importInboxForRequest` | Loads the sample inbox onto the sample trip |
| `addUploadedEvidence` | Adds the employee's own files to their trip |
| `redraft` *(internal)* | Re-runs duplicate detection and the engine over **every** document on the trip, and rebuilds the draft. Lines the employee removed or typed stay as they were |
| `recalculate` | Recomputes a claim's totals from its stored lines |
| `submitClaim` | Refuses if a blocking flag is open; otherwise builds the approval chain and files it |
| `decideOnClaim` | Approve, send back or reject — in order, never your own claim. Finance verification sets the payment-run date; payment release marks it Paid |
| `setLineStatus`, `setAttendees`, `resolveFlag`, `addManualLine` | The employee's edits to a draft |
| `confirmUnreadableDocument`, `removeDocument` | Price a bill nothing could read, or take it off the trip |
| `recheckClaim` | "Run the checks again" — re-reads the evidence without adding any |
| `claimWithEverything`, `claimsVisibleTo`, `pendingApprovalsFor` | The queries the pages use; `claimsVisibleTo` limits what each role can see |

## `src/lib/excel/` — layer 5, the workbook

### `export.ts` — `buildSettlementWorkbook()`
Opens `Travel_Expense_Forms_Template.xlsx` and writes only its input cells: both
sheets, every section, the approval rows. **It never overwrites a formula** — so
Excel computes the totals itself and lands on the same figures. If a section has
more lines than the form has rows, the last row says so instead of dropping them.

---

## `src/lib/` — shared helpers

| File | Does |
|---|---|
| `money.ts` | `round2` to the paisa, `parseINR` ("INR 1,415.02" → 1415.02), `formatINR`, and `taxShare` — splits one bill's tax across its components |
| `dates.ts` | Everything in IST: reading the pack's loose date formats, `inclusiveDays` (travel days count in full), `nextPaymentRun` (the 10th or 25th) |
| `db.ts` | The single Prisma client |
| `session.ts` | Who is using the app. A cookie holding an employee code — the demo stand-in for SSO. `getActor` returns their role flags; swapping in real SSO changes only this file |
| `sample.ts` | `SAMPLE_TRIP_ID` — the one trip whose inbox ships with the app |
| `ui.ts` | Status labels and colours, and plain-English names for each classification |

## `src/lib/__tests__/` — the tests

| File | Proves |
|---|---|
| `pack.test.ts` | The pack's trip end to end: all 15 emails classified, the traps excluded, the folio split, **₹27,318.04 / ₹929.60 / ₹26,388.44 / ₹6,388.44**, the flags, the approval chain, IST dates |
| `uploads.test.ts` | A trip that brings its own evidence: uploads read and claimed, duplicates caught (including one bill by two routes), unreadable bills blocked rather than guessed, someone else's receipt excluded, tax rows never paid twice |

`npm test` runs all 20 in under a second, with or without a Gemini key.

---

## `src/app/` — layer 4, what people see

`(app)` is a Next.js **route group**: the brackets keep it out of the URL, so
`(app)/claims/page.tsx` is served at `/claims`. It exists so every signed-in page
shares one layout.

### Top level

| File | Does |
|---|---|
| `layout.tsx` | The `<html>` element and the IBM Plex fonts |
| `page.tsx` | `/` — redirects to sign-in or the dashboard |
| `globals.css` | The colour and font tokens, and the ruled "ledger" table style the whole app uses |
| `sign-in/page.tsx` | Pick who you are from the employee master, claimants first |
| `actions.ts` | **Every mutation**, as server actions. Each one re-reads who is acting from the cookie rather than trusting the form. Raising a request, approving it, releasing the advance, uploading, pricing, removing, filing, deciding |

### `(app)/` — the signed-in pages

| Route | File | Who | Shows |
|---|---|---|---|
| — | `layout.tsx` | everyone | Sidebar built from your role, with counts of what is waiting. Sends you to sign-in if you are not signed in |
| `/dashboard` | `dashboard/page.tsx` | everyone | What needs you, what is with someone else, the advance to settle |
| `/requests` | `requests/page.tsx` | everyone | Your trips, with their state and settlement |
| `/requests/new` | `requests/new/page.tsx` | employees | The travel request form |
| `/requests/TRQ-…` | `requests/[trqId]/page.tsx` | everyone | One trip: estimate, approvals, advance, and the evidence upload that starts the settlement |
| `/claims` | `claims/page.tsx` | everyone | Settlements, with what each is waiting on |
| `/claims/…` | `claims/[claimId]/page.tsx` | everyone | **The settlement workspace** — shaped like the paper form: lodging, travel, other, summary, approvals, what was read, the audit trail, and the policy checks panel |
| `/claims/…/evidence/…` | `…/evidence/[documentId]/page.tsx` | everyone | One document beside what the reader made of it — "where did this number come from?" |
| `/approvals` | `approvals/page.tsx` | approvers, Finance | Your queue, with the parts worth checking called out |
| `/finance` | `finance/page.tsx` | Finance | To verify, queued for payment, next run date, spend by head |
| `/admin/categories` | `admin/categories/page.tsx` | admin | Stages and editable approval thresholds |
| `/admin/policy` | `admin/policy/page.tsx` | admin | The policy as the engine holds it |
| `/admin/people` | `admin/people/page.tsx` | admin | The employee master, and who would approve a claim for each person |

### `api/` — downloads

| Route | Does |
|---|---|
| `api/claims/[claimId]/export/route.ts` | The filled `.xlsx`. Only the claimant, their approvers and Finance may download it |
| `api/documents/[documentId]/image/route.ts` | A bill image — from the pack on disk, or an upload stored in the database |

---

## `src/components/` — interface pieces

| File | Does |
|---|---|
| `ui.tsx` | The building blocks: `Pill`, `ClauseTag` ("Policy 3.5"), `Money`, `Panel`, `SettlementStrip` (the four numbers), `Stepper` (the six stages), `MarginNote` (a policy verdict), `EmptyState`, buttons |
| `nav-link.tsx` | A sidebar link that knows when it is the current page |
| `request-form.tsx` | The travel request form, checking the policy **as you type** |
| `evidence-upload.tsx` | Drag-and-drop for a trip's emails and bills |
| `claim-forms.tsx` | File the settlement, remove or restore a line, record attendees, clear a check, add a line by hand |
| `price-document-form.tsx` | Price a bill nothing could read — or remove it. Sits on the blocking check itself |
| `decision-form.tsx` | Approve, send back or reject. Sending back and rejecting require remarks (policy 2.3) |
| `threshold-form.tsx` | The admin's approval thresholds |

---

## Follow one click through the code

**Chaitanya presses "Load the sample inbox"** on `/requests/TRQ-2026-0001`:

1. `app/actions.ts` → `importInbox` checks who is signed in.
2. `services/claim-service.ts` → `importInboxForRequest` loads the trip.
3. `ingest/pipeline.ts` → `ingestPack` reads the 15 emails in parallel.
4. `ingest/eml.ts` → `parseEml` unpacks each one.
5. `ingest/parsers.ts` → `parseEmail` picks the rule for the sender, classifies it,
   extracts it, and excludes a colleague's ride.
6. `ai/receipt-reader.ts` reads the two photographed bills.
7. `ingest/parsers.ts` → `markDuplicates` sets aside the forwarded copy of the ₹172 ride.
8. Back in `claim-service.ts`, each document is stored, then `redraft` runs.
9. `policy/engine.ts` → `runPolicyEngine` turns the documents into lines and flags,
   using the numbers in `policy/config.ts`.
10. `recalculate` totals the stored lines: ₹26,388.44 net, ₹6,388.44 payable.
11. The browser goes to `/claims/…`, and `claims/[claimId]/page.tsx` renders it,
    with `policy/guidance.ts` deciding which checks are his to deal with.

---

## Where to change things

| To change… | Edit |
|---|---|
| A cap, a threshold, the non-reimbursable list | `src/lib/policy/config.ts` |
| A new rule that raises a flag | `src/lib/policy/engine.ts`, then who acts on it in `guidance.ts` |
| Reading a new sender's emails | Add a rule in `src/lib/ingest/parsers.ts` |
| Which model reads bills | `MODEL_CANDIDATES` in `src/lib/ai/receipt-reader.ts`, or set `GEMINI_MODEL` |
| The approval thresholds | The admin Categories page — no code |
| Real sign-in (SSO) | `src/lib/session.ts` only |
| The data model | `prisma/schema.prisma`, then `npm run setup` |

---

## `scripts/` — tooling, not the app

Two are part of the build; the rest drove the app in a real browser or read the
database while it was being built and debugged. None is imported by the app.

**Used by the build**

| File | Does |
|---|---|
| `ensure-env.mjs` | Creates `.env` from `.env.example` on a fresh clone. First step of `npm run setup` |
| `postgres-schema.mjs` | Writes the Postgres schema from the SQLite one at deploy time. Fails loudly if anything does not match |

**End-to-end runs in a browser** (Playwright)

| File | Runs |
|---|---|
| `flow.mjs` | `npm run demo` — the sample trip through every role to Paid |
| `own-trip.mjs` | A Hyderabad trip settled from its own evidence, over-cap hotel included |
| `repro-goa.mjs` | The same hotel bill uploaded by two routes |
| `flow2.mjs`, `flow3.mjs` | A new request, the advance cap, a request sent back; a claim sent back and filed again |
| `crawl.mjs` | Every route as each role, flagging any server error |
| `shots.mjs`, `mobile.mjs`, `mobile2.mjs`, `panel-shot.mjs`, `panel-prod.mjs` | Screenshots, and the check for sideways overflow on a phone |
| `catch-error.mjs`, `exercise.mjs`, `diag-prod.mjs` | Reproducing production errors with the browser console captured |

**Checks on data and output**

| File | Does |
|---|---|
| `smoke.ts` | The service layer end to end, without a browser |
| `verify-xlsx.mjs`, `check-export.mjs`, `check-export-prod.mjs` | Download the workbook and recompute the template's own formulas |
| `inspect-claim.mjs`, `whose.mjs`, `state.mjs`, `check-cols.mjs`, `check-neon.mjs`, `fingerprints.mjs`, `compare-read.mjs`, `check-parsers.mjs`, `check-notes.mjs`, `flag-audit.ts` | Read the database to diagnose a claim |
| `quota.mjs`, `key-check.mjs`, `key-detail.mjs`, `gen-detail.mjs`, `model-probe.mjs`, `forbidden.mjs`, `test-gemini.mjs`, `test-receipts.mjs` | Diagnose a Gemini key: quota, retired models, access |

The database scripts expect `DATABASE_URL` in the environment; no credentials are stored in any of them.

---

## Config files at the root

| File | Does |
|---|---|
| `package.json` | Dependencies, and the commands: `setup`, `dev`, `test`, `demo`, `build:vercel` |
| `next.config.ts` | Hides the dev badge, allows 12 MB uploads, bundles `data/pack` into the deployment |
| `vercel.json` | Points Vercel's build at `npm run build:vercel` |
| `vitest.config.ts` | A 60-second test timeout, for when the model reads the bills |
| `tsconfig.json` | TypeScript, and the `@/` shorthand for `src/` |
| `postcss.config.mjs` | Wires in Tailwind |
| `.prettierrc.json` | Formatting |
| `.env.example` | The two settings: `DATABASE_URL`, and an optional `GEMINI_API_KEY` |
| `.gitignore` | Keeps `.env`, the SQLite file and build output out of git |
| `AGENTS.md`, `CLAUDE.md` | Written by `next dev` itself: tells AI coding tools to read this Next.js version's own docs |
| `public/*.svg` | Left over from the Next.js starter; unused |
