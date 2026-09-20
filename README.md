# Nortex Reimbursements

A travel expense settlement app for Nortex Industries. It reads the employee's
inbox for a trip, applies the company's travel policy, drafts the settlement
form, routes it through the approval chain the policy matrix demands, and tracks
it to the payment run.

**Live: https://nortex-expense.vercel.app** — sign in as Chaitanya Reddy and open TRQ-2026-0001.

Built for the take-home in `../pack`. The pack is the specification.

## Run it

```bash
npm install
npm run setup     # generates the Prisma client, creates the SQLite file, seeds the company
npm run dev       # http://localhost:3000
```

Nothing else has to be installed — no database server, no Docker. `npm run setup`
is idempotent: run it again whenever you want the demo back at its starting point.

Optional, for reading the photographed bills with a model rather than the stored
readings:

```bash
# .env
GEMINI_API_KEY="..."      # https://aistudio.google.com/apikey — free tier
```

The free tier allows 20 requests a day per model, and one import of this trip
costs two of them. Past that the reader falls back to the stored readings and
says so on each document, which is why the tests pass either way.

## Walk through it

1. **Sign in as Chaitanya Reddy (NX-4471).** There is no password: pick a person.
2. Open the approved trip **TRQ-2026-0001** and press **Read my inbox**.
3. The settlement is drafted from the 15 emails and 2 bills. Check the lines, the
   disallowances, and the policy checks in the margin.
4. Record the dinner attendees, clear the two blocking checks, and **File the settlement**.
5. Sign in as **Suresh Iyer** (manager), then **Meera Krishnan** (head of department),
   then **Ravi Menon** (Finance verification), then **Kavitha Balan** (payment).
6. Download the filled `.xlsx` at any point — it is the company's own template.

`npm run demo` drives all of that in a real browser and screenshots each step.

## Tests

```bash
npm test
```

The suite works the pack's trip end to end: what each of the 15 emails is, what is
excluded and why, how the hotel folio splits, and the settlement arithmetic
(₹27,318.04 claimed, ₹929.60 disallowed, ₹26,388.44 net, ₹6,388.44 payable after
the ₹20,000 advance). The numbers were worked out by hand from the pack before the
engine existed.

## How it is put together

```
src/lib/ingest/     reads .eml files and bill images into structured documents
src/lib/ai/         Gemini for photographed bills, with verified readings as fallback
src/lib/policy/     the policy as data and as a pure engine; the approval chain resolver
src/lib/services/   persistence, submission, decisions, the audit trail
src/lib/excel/      fills the company's own workbook, leaving its formulas alone
src/app/            Next.js App Router: employee, approver, finance and admin views
```

The engine is pure: a travel request plus documents in, claim lines and policy
flags out, no database and no network. That is what makes the whole of it testable
against the pack.

## Deploying

The app runs on Vercel with a free Neon Postgres database.

```bash
# 1. Create a Neon project and copy its connection string.
# 2. In Vercel: New Project -> import this repo -> add the environment variable:
#      DATABASE_URL = postgresql://...       (and GEMINI_API_KEY if you have one)
# 3. Deploy. vercel.json already points the build at npm run build:vercel.
```

`build:vercel` generates the Postgres variant of the schema from the SQLite one,
pushes it, seeds the company, and builds. Each deployment therefore resets the
demo data, which is what you want for a demo and not what you would ship to
Nortex.

## What this is not

A demo sign-in stands in for SSO, and the "inbox" is the pack's folder rather than
a live mailbox. Both are single, clearly-marked seams. See `NOTE.md` for the full
list of what was left out on purpose and where it breaks.
