import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { resolveApprovalChain, type Person } from "@/lib/policy/approvals";
import { requiredApprovalRoles } from "@/lib/policy/config";
import { formatINR } from "@/lib/money";
import { PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

const SAMPLE_VALUE = 26388.44;

/**
 * The employee master, and what it means in practice: for each person, who would
 * actually have to sign a claim of a given size. This is where policy 2.2 shows
 * itself - a manager's own claim skips the level they hold.
 */
export default async function PeoplePage() {
  const actor = await requireActor();
  if (!actor.isAdmin) redirect("/dashboard");

  const rows = await db.employee.findMany({ orderBy: { empCode: "asc" } });
  const master = new Map<string, Person>(
    rows.map((r) => [
      r.empCode,
      {
        empCode: r.empCode,
        name: r.name,
        email: r.email,
        role: r.role,
        designation: r.designation,
        department: r.department,
        managerCode: r.managerCode,
      },
    ]),
  );

  return (
    <>
      <PageHeader
        title="People"
        lede="Loaded from employee_master.csv. The reporting line here is what the approval chain is built from — there is no separate approver list to keep in step."
      />

      <Panel
        title="Employee master"
        hint={`The last column resolves the chain for a claim of ${formatINR(SAMPLE_VALUE)} — the Bengaluru settlement in the pack.`}
      >
        <table className="ledger">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Reports to</th>
              <th>Would be approved by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((person) => {
              const chain = resolveApprovalChain(
                master.get(person.empCode)!,
                master,
                requiredApprovalRoles(SAMPLE_VALUE),
                "",
              ).filter((s) => !s.role.startsWith("Finance -"));

              return (
                <tr key={person.empCode}>
                  <td className="ident">{person.empCode}</td>
                  <td>
                    <div className="text-ink">{person.name}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">{person.email}</div>
                  </td>
                  <td className="text-ink-soft">{person.designation}</td>
                  <td className="text-ink-soft">
                    {person.department}
                    <div className="text-xs text-ink-faint">{person.costCentre}</div>
                  </td>
                  <td className="text-ink-soft">
                    {master.get(person.managerCode ?? "")?.name ?? <span className="text-ink-faint">—</span>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {chain.map((step) =>
                        step.skipped ? (
                          <Pill key={step.level} tone="neutral">
                            {step.role} skipped
                          </Pill>
                        ) : (
                          <Pill key={step.level} tone="stamp">
                            {step.approverName ?? step.role}
                          </Pill>
                        ),
                      )}
                      <Pill tone="neutral">Finance</Pill>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-faint">
        Note what happens to Suresh Iyer: he is the Reporting Manager his own team claims through, so
        on his own claim that level drops out and Meera Krishnan acts instead (policy 2.2). Nothing
        needs configuring for that — it falls out of the reporting line.
      </p>
    </>
  );
}
