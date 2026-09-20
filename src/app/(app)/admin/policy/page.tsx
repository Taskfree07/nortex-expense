import { readFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import {
  ADVANCE_CAP_RATIO,
  APPROVAL_MATRIX,
  ENTERTAINMENT_PRIOR_APPROVAL_ABOVE,
  LODGING_CAP,
  MEAL_BILL_THRESHOLD,
  MEAL_CAP,
  NON_REIMBURSABLE_PATTERNS,
  SUBMISSION_WINDOW_DAYS,
} from "@/lib/policy/config";
import { formatINR } from "@/lib/money";
import { ClauseTag, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * The policy as the engine holds it. Everything on this page is read straight
 * from src/lib/policy/config.ts, so what you see here is what a claim is judged
 * against - there is no second copy of these numbers.
 */
export default async function PolicyPage() {
  const actor = await requireActor();
  if (!actor.isAdmin) redirect("/dashboard");

  const source = await readFile(path.join(process.cwd(), "data", "pack", "expense_policy.md"), "utf8");

  return (
    <>
      <PageHeader
        title="Policy rules"
        lede="NTX-HR-POL-11 Rev 4, as the engine applies it. Each claim line carries the clause it was judged under."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Lodging, per night"
          hint="On the room tariff excluding taxes. Taxes on the tariff are reimbursed in full."
        >
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>City class</th>
                  <th className="amount">Limit</th>
                  <th>Clause</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(LODGING_CAP).map(([tier, cap]) => (
                  <tr key={tier}>
                    <td className="text-ink">{tier.replace("_", " ")}</td>
                    <td className="amount">{formatINR(cap)}</td>
                    <td>
                      <ClauseTag clause="3.1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Meals, per full day"
          hint="Travel days count as full days. A bill is needed above the threshold."
        >
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>City class</th>
                  <th className="amount">Limit</th>
                  <th>Clause</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(MEAL_CAP).map(([tier, cap]) => (
                  <tr key={tier}>
                    <td className="text-ink">{tier.replace("_", " ")}</td>
                    <td className="amount">{formatINR(cap)}</td>
                    <td>
                      <ClauseTag clause="3.3" />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="text-ink-soft">Bill required above</td>
                  <td className="amount">{formatINR(MEAL_BILL_THRESHOLD)}</td>
                  <td>
                    <ClauseTag clause="3.3" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Approval matrix"
          hint="Read against the claimed value. International travel always adds the MD."
        >
          <div className="table-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="amount">Up to</th>
                  <th>Approvals required</th>
                </tr>
              </thead>
              <tbody>
                {APPROVAL_MATRIX.map((band) => (
                  <tr key={String(band.upTo)}>
                    <td className="amount">
                      {band.upTo === Infinity ? "Above 2,00,000" : formatINR(band.upTo)}
                    </td>
                    <td className="text-ink-soft">{band.roles.join(", ")}</td>
                  </tr>
                ))}
                <tr>
                  <td className="amount text-ink-faint">Any</td>
                  <td className="text-ink-soft">
                    Finance verification, after the business approvals <ClauseTag clause="2.1" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="The rest of it">
          <dl className="divide-y divide-rule">
            <Fact
              label="Advance ceiling"
              value={`${ADVANCE_CAP_RATIO * 100}% of the employee-borne estimate`}
              clause="1.2"
            />
            <Fact
              label="Settlement window"
              value={`${SUBMISSION_WINDOW_DAYS} calendar days from return`}
              clause="5.1"
            />
            <Fact
              label="Business entertainment"
              value={`Prior HoD approval above ${formatINR(ENTERTAINMENT_PRIOR_APPROVAL_ABOVE)}, attendees always required`}
              clause="3.5"
            />
            <Fact label="Payment runs" value="The 10th and the 25th of each month" clause="5.4" />
            <Fact
              label="Proof"
              value="Every claim line needs a supporting document, or it is returned"
              clause="5.2"
            />
            <Fact
              label="Duplicates"
              value="Reconciled on bill number, date, amount and merchant"
              clause="5.3"
            />
            <Fact
              label="Self-approval"
              value="An approver cannot approve their own claim; that level is skipped"
              clause="2.2"
            />
          </dl>
        </Panel>

        <Panel
          title="Never reimbursed"
          hint="Excluded even when they appear on a hotel folio or a consolidated bill."
        >
          <ul className="grid gap-2 px-5 py-4 sm:grid-cols-2">
            {NON_REIMBURSABLE_PATTERNS.map((rule) => (
              <li key={rule.label} className="text-sm text-ink-soft">
                {rule.label}
              </li>
            ))}
          </ul>
          <p className="border-t border-rule px-5 py-3 text-xs text-ink-faint">
            Matched against the wording on the bill, with the tax that sits on top of them apportioned and
            disallowed as well <ClauseTag clause="4" />
          </p>
        </Panel>

        <Panel title="The policy as issued" hint="data/pack/expense_policy.md, unedited.">
          <pre className="max-h-96 overflow-auto px-5 py-4 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
            {source}
          </pre>
        </Panel>
      </div>
    </>
  );
}

function Fact({ label, value, clause }: { label: string; value: string; clause: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <div>
        <dt className="text-sm text-ink">{label}</dt>
        <dd className="mt-0.5 text-xs text-ink-soft">{value}</dd>
      </div>
      <ClauseTag clause={clause} />
    </div>
  );
}
