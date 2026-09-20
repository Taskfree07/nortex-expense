/**
 * Turns the roles the approval matrix asks for into the actual people who must act,
 * by walking the reporting line in employee_master.csv.
 *
 * Policy 2.2: an approver cannot approve their own claim. Where the claimant IS
 * the approver for a level, that level is skipped and the next level up acts.
 */

export type Person = {
  empCode: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  department: string;
  managerCode: string | null;
};

export type ResolvedStep = {
  level: number;
  role: string;
  approverCode: string | null;
  approverName: string | null;
  requiredBecause: string;
  skipped: boolean;
  skipReason?: string;
};

const ROLE_ORDER = ["Reporting Manager", "Head of Department", "Head of Division", "MD"];

/** Walks up the reporting line until someone holds the wanted role. */
function findUpward(claimant: Person, people: Map<string, Person>, role: string): Person | null {
  const seen = new Set<string>();
  let current: Person | undefined = claimant;
  while (current?.managerCode && !seen.has(current.managerCode)) {
    seen.add(current.managerCode);
    const manager: Person | undefined = people.get(current.managerCode);
    if (!manager) return null;
    if (role === "Reporting Manager" && manager.empCode === claimant.managerCode) return manager;
    if (manager.role === role) return manager;
    current = manager;
  }
  // Fall back to anyone in the company holding that role (e.g. the MD).
  for (const person of people.values()) if (person.role === role) return person;
  return null;
}

export function resolveApprovalChain(
  claimant: Person,
  people: Map<string, Person>,
  roles: string[],
  reason: string,
): ResolvedStep[] {
  const ordered = [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const steps: ResolvedStep[] = [];
  let level = 1;

  for (const role of ordered) {
    const approver = findUpward(claimant, people, role);

    if (approver && approver.empCode === claimant.empCode) {
      // Policy 2.2 - the claimant is this level. Skip it; the next level up acts.
      steps.push({
        level: level++,
        role,
        approverCode: null,
        approverName: null,
        requiredBecause: reason,
        skipped: true,
        skipReason:
          "The claimant holds this role, so the level is skipped and the next level up acts (policy 2.2).",
      });
      continue;
    }

    steps.push({
      level: level++,
      role,
      approverCode: approver?.empCode ?? null,
      approverName: approver?.name ?? null,
      requiredBecause: reason,
      skipped: false,
      ...(approver ? {} : { skipReason: "No holder of this role was found in the employee master." }),
    });
  }

  // Policy 2.1 - Finance verifies every claim, whatever its value, after the
  // business approvals, and then releases the payment.
  const financeVerifier = pickFinance(people, "Manager - Finance Shared Services");
  const financeReleaser = pickFinance(people, "Controller") ?? financeVerifier;

  steps.push({
    level: level++,
    role: "Finance - verification",
    approverCode: financeVerifier?.empCode ?? null,
    approverName: financeVerifier?.name ?? null,
    requiredBecause: "Finance verification is required on every claim regardless of value (policy 2.1).",
    skipped: false,
  });
  steps.push({
    level: level++,
    role: "Finance - payment released",
    approverCode: financeReleaser?.empCode ?? null,
    approverName: financeReleaser?.name ?? null,
    requiredBecause: "Verified claims are paid in the run on the 10th and the 25th (policy 5.4).",
    skipped: false,
  });

  return steps;
}

function pickFinance(people: Map<string, Person>, designation: string): Person | null {
  const finance = [...people.values()].filter((p) => p.role === "Finance");
  return finance.find((p) => p.designation === designation) ?? finance[0] ?? null;
}
