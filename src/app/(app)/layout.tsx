import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { signOut } from "@/app/actions";
import { db } from "@/lib/db";
import { cn } from "@/lib/ui";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const pendingApprovals = await db.approvalStep.count({
    where: { approverCode: actor.empCode, decision: "PENDING", claimId: { not: null } },
  });
  const needsAttention = await db.claim.count({
    where: { employeeCode: actor.empCode, status: { in: ["DRAFT", "RETURNED"] } },
  });

  const nav = [
    { group: "Work", items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/requests", label: "Travel requests" },
      { href: "/claims", label: "Claims", badge: needsAttention || undefined },
    ]},
    ...(actor.isApprover || actor.isFinance
      ? [{ group: "Review", items: [{ href: "/approvals", label: "Approvals", badge: pendingApprovals || undefined }] }]
      : []),
    ...(actor.isFinance
      ? [{ group: "Finance", items: [{ href: "/finance", label: "Payments" }] }]
      : []),
    ...(actor.isAdmin
      ? [{ group: "Build", items: [
          { href: "/admin/categories", label: "Categories" },
          { href: "/admin/policy", label: "Policy rules" },
          { href: "/admin/people", label: "People" },
        ] }]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-56 shrink-0 flex-col border-r border-rule bg-card lg:flex">
        <div className="border-b border-rule px-5 py-4">
          <Link href="/dashboard" className="block">
            <div className="text-sm font-semibold tracking-tight text-ink">Nortex</div>
            <div className="text-xs text-ink-faint">Reimbursements</div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {nav.map((section) => (
            <div key={section.group} className="mb-5">
              <div className="px-3 pb-1.5 text-[0.6875rem] font-medium text-ink-faint">{section.group}</div>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} badge={item.badge}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-rule px-5 py-4">
          <div className="text-sm font-medium text-ink">{actor.name}</div>
          <div className="text-xs leading-snug text-ink-faint">{actor.designation}</div>
          <form action={signOut} className="mt-3">
            <button type="submit" className="text-xs text-stamp hover:underline">
              Switch person
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-4 border-b border-rule bg-card px-6 py-3 lg:hidden">
          <Link href="/dashboard" className="text-sm font-semibold text-ink">
            Nortex Reimbursements
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs text-stamp">
              {actor.name} · switch
            </button>
          </form>
        </header>

        <nav className="no-print flex gap-1 overflow-x-auto border-b border-rule bg-card px-4 py-2 lg:hidden">
          {nav.flatMap((s) => s.items).map((item) => (
            <NavLink key={item.href} href={item.href} badge={item.badge} compact>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className={cn("flex-1 px-4 py-8 sm:px-8")}>
          <div className="mx-auto w-full max-w-[74rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
