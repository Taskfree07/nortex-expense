import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { PageHeader, Panel, Pill } from "@/components/ui";
import { ThresholdForm } from "@/components/threshold-form";

export const dynamic = "force-dynamic";

/**
 * What an Admin configures: the stages a category runs through, and the value at
 * which each approver joins the chain. The thresholds here are what the engine
 * reads, so changing one changes who has to sign the next claim.
 */
export default async function CategoriesPage() {
  const actor = await requireActor();
  if (!actor.isAdmin) redirect("/dashboard");

  const categories = await db.category.findMany({ orderBy: { code: "asc" } });

  return (
    <>
      <PageHeader
        title="Categories"
        lede="A category binds a stage sequence, an approval chain and the policy rules that are checked live. Domestic travel runs six stages; a conference claim runs three."
      />

      <div className="space-y-6">
        {categories.map((category) => {
          const stages = JSON.parse(category.stagesJson) as { key: string; label: string; hint: string }[];
          const approvers = JSON.parse(category.approversJson) as {
            level: number;
            role: string;
            thresholdAbove: number;
          }[];
          const rules = JSON.parse(category.rulesJson) as string[];

          return (
            <Panel
              key={category.code}
              title={category.name}
              hint={category.description}
              actions={
                <div className="flex items-center gap-2">
                  <span className="ident text-ink-faint">{category.code}</span>
                  <Pill tone={category.live ? "moss" : "neutral"}>
                    {category.live ? `Live · v${category.version}` : "Draft"}
                  </Pill>
                </div>
              }
            >
              <div className="border-b border-rule px-5 py-4">
                <h3 className="text-xs font-medium text-ink">Stages</h3>
                <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
                  {stages.map((stage, index) => (
                    <li key={stage.key} className="flex items-center gap-2">
                      <span className="border border-rule bg-paper px-2 py-1 text-xs text-ink">
                        <span className="ident mr-1.5 text-ink-faint">{index + 1}</span>
                        {stage.label}
                      </span>
                      {index < stages.length - 1 ? <span className="text-ink-faint">·</span> : null}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="border-b border-rule px-5 py-4">
                <h3 className="text-xs font-medium text-ink">Who approves, and from what value</h3>
                <p className="mt-1 text-xs text-ink-faint">
                  An approver joins the chain when the claimed value crosses their threshold. Finance
                  verifies every claim whatever the value, so it is not listed here.
                </p>
                <div className="mt-3">
                  <ThresholdForm code={category.code} approvers={approvers} />
                </div>
              </div>

              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-ink">Rules checked live</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {rules.map((rule) => (
                    <li key={rule}>
                      <span className="ident border border-rule bg-paper px-1.5 py-0.5 text-[0.6875rem] text-ink-soft">
                        {rule.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-faint">
        Deliberately left out: a drag-and-drop workflow canvas and a form builder. The stage sequences are
        seeded from the two forms Nortex uses today, and the thresholds above are the part that actually
        changes month to month — so that is the part that is editable. Totals on claims already filed do not
        move: an in-flight claim keeps the chain it was filed under.
      </p>
    </>
  );
}
