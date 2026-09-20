import { db } from "@/lib/db";
import { signIn } from "@/app/actions";
import { buttonStyles } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_BLURB: Record<string, string> = {
  Employee: "Files travel requests and settles them against bills.",
  "Reporting Manager": "First approval on their team's trips and claims.",
  "Head of Department": "Second approval once a claim passes 25,000.",
  "Head of Division": "Third approval above 75,000.",
  MD: "Signs off above 2,00,000 and on international travel.",
  Finance: "Verifies every claim, then releases the payment.",
};

/** Claimants first, then up the chain, then Finance: the order you meet them in. */
const ROLE_ORDER = ["Employee", "Reporting Manager", "Head of Department", "Head of Division", "MD", "Finance"];

export default async function SignInPage() {
  const rows = await db.employee.findMany({ orderBy: { empCode: "asc" } });
  const people = rows.sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="max-w-2xl">
        <p className="ident text-ink-faint">Nortex Industries Ltd</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
          Your trip, settled from your inbox.
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft">
          The approvals, the tickets, the cab receipts and the hotel bill are already in your
          mail. This reads them, applies NTX-HR-POL-11, and files the settlement form for you.
          You check the numbers instead of typing them.
        </p>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-ink">Choose who you are</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A demo sign-in against the employee master. There is no password here, and the note
          says so: what you can see and decide comes from this person&apos;s row and reporting line.
        </p>

        <ul className="mt-5 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <li key={person.empCode} className="bg-card">
              <form action={signIn}>
                <input type="hidden" name="empCode" value={person.empCode} />
                <button
                  type="submit"
                  className="flex h-full w-full flex-col gap-1 px-4 py-4 text-left transition-colors hover:bg-paper"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{person.name}</span>
                    <span className="ident text-ink-faint">{person.empCode}</span>
                  </span>
                  <span className="text-xs text-ink-soft">{person.designation}</span>
                  <span className="mt-1 text-xs leading-snug text-ink-faint">
                    {ROLE_BLURB[person.role] ?? person.role}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 max-w-xl text-xs leading-relaxed text-ink-faint">
        Start as Chaitanya Reddy to file the Bengaluru trip, then sign in as Suresh Iyer to
        approve it, Meera Krishnan for the second approval, and Ravi Menon to verify and pay.
      </p>
    </main>
  );
}
