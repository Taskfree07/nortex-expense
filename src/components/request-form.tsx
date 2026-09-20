"use client";

import { useMemo, useState } from "react";
import { createTravelRequest } from "@/app/actions";
import { ADVANCE_CAP_RATIO, LODGING_CAP, MEAL_CAP, classifyCity, requiredApprovalRoles } from "@/lib/policy/config";
import { formatINR, round2 } from "@/lib/money";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/ui";

/**
 * The request form checks the policy as you fill it in, rather than after you
 * submit: the approval chain, the lodging cap for the city you typed, and the
 * ceiling on the advance all move with the numbers.
 */
export function RequestForm() {
  const [destination, setDestination] = useState("");
  const [travelType, setTravelType] = useState("DOMESTIC");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [lodgingBorneBy, setLodgingBorneBy] = useState("Employee");
  const [estAir, setEstAir] = useState(0);
  const [estLodging, setEstLodging] = useState(0);
  const [estConveyance, setEstConveyance] = useState(0);
  const [estMeals, setEstMeals] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cityClass = useMemo(() => classifyCity(destination.split("/")[0]), [destination]);
  const days = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const a = new Date(fromDate).getTime();
    const b = new Date(toDate).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }, [fromDate, toDate]);

  const total = round2(estAir + estLodging + estConveyance + estMeals);
  const employeeBorne = round2(
    estConveyance + estMeals + (lodgingBorneBy === "Employee" ? estLodging : 0),
  );
  const advanceCap = round2(employeeBorne * ADVANCE_CAP_RATIO);
  const chain = requiredApprovalRoles(total, travelType === "INTERNATIONAL");
  const nights = Math.max(0, days - 1);
  const lodgingCapTotal = round2(LODGING_CAP[cityClass] * nights);
  const mealCapTotal = round2(MEAL_CAP[cityClass] * days);

  const advanceOverCap = advance > advanceCap;
  const lodgingOverCap = nights > 0 && estLodging > lodgingCapTotal;
  const mealsOverCap = days > 0 && estMeals > mealCapTotal;

  return (
    <form
      action={async (formData) => {
        setError(null);
        try {
          await createTravelRequest(formData);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="space-y-6">
        <fieldset className="border border-rule bg-card">
          <legend className="sr-only">Travel detail</legend>
          <div className="border-b border-rule px-5 py-3 text-sm font-semibold text-ink">
            <span className="ident mr-2 text-ink-faint">1</span>Where and when
          </div>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <Field label="Destination" hint={destination ? `Read as ${cityClass.replace("_", " ").toLowerCase()}` : "City, or city / customer"}>
              <input
                name="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Bengaluru / Vertex Technologies"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Purpose of travel">
              <input name="purpose" placeholder="Customer meeting + site visit" className={inputClass} required />
            </Field>
            <Field label="Leaving on">
              <input
                type="date"
                name="fromDate"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Back on" hint={days ? `${days} day(s), ${nights} night(s)` : undefined}>
              <input
                type="date"
                name="toDate"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Mode of travel">
              <select name="mode" className={inputClass} defaultValue="Flight">
                <option>Flight</option>
                <option>Train</option>
                <option>Road</option>
              </select>
            </Field>
            <Field label="Travel type" hint={travelType === "INTERNATIONAL" ? "International travel always goes to the MD" : undefined}>
              <select
                name="travelType"
                value={travelType}
                onChange={(e) => setTravelType(e.target.value)}
                className={inputClass}
              >
                <option value="DOMESTIC">Domestic</option>
                <option value="INTERNATIONAL">International</option>
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset className="border border-rule bg-card">
          <legend className="sr-only">Estimated cost</legend>
          <div className="border-b border-rule px-5 py-3 text-sm font-semibold text-ink">
            <span className="ident mr-2 text-ink-faint">2</span>What you expect it to cost
          </div>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <Field label="Air or rail" hint="Booked through the travel desk, billed to the company">
              <input type="number" min={0} name="estAir" value={estAir || ""} onChange={(e) => setEstAir(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field
              label="Lodging"
              hint={nights ? `Cap ${formatINR(lodgingCapTotal)} for ${nights} night(s) in a ${cityClass.replace("_", " ").toLowerCase()} city` : "Room tariff excluding taxes"}
              warn={lodgingOverCap ? "Above the per-night limit. The excess will not be reimbursed." : undefined}
            >
              <input type="number" min={0} name="estLodging" value={estLodging || ""} onChange={(e) => setEstLodging(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field label="Who pays the hotel">
              <select name="lodgingBorneBy" value={lodgingBorneBy} onChange={(e) => setLodgingBorneBy(e.target.value)} className={inputClass}>
                <option value="Employee">I pay and claim it</option>
                <option value="Company">Billed to the company</option>
              </select>
            </Field>
            <Field label="Local conveyance" hint="Cabs, on actuals against receipts">
              <input type="number" min={0} name="estConveyance" value={estConveyance || ""} onChange={(e) => setEstConveyance(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field
              label="Meals"
              hint={days ? `Cap ${formatINR(mealCapTotal)} for ${days} day(s)` : "On actuals, up to the daily limit"}
              warn={mealsOverCap ? "Above the daily meal limit for this city class." : undefined}
            >
              <input type="number" min={0} name="estMeals" value={estMeals || ""} onChange={(e) => setEstMeals(Number(e.target.value))} className={inputClass} />
            </Field>
            <Field
              label="Advance requested"
              hint={`Up to 60% of what you bear: ${formatINR(advanceCap)}`}
              warn={advanceOverCap ? "Above the 60% ceiling. Lower it, or the request will be sent back." : undefined}
            >
              <input type="number" min={0} name="advanceRequested" value={advance || ""} onChange={(e) => setAdvance(Number(e.target.value))} className={inputClass} />
            </Field>
          </div>
        </fieldset>

        {error ? (
          <p className="border border-rust/40 bg-rust-wash px-4 py-3 text-sm text-rust">{error}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <button type="submit" className={buttonStyles.primary} disabled={advanceOverCap}>
            Send for approval
          </button>
          <span className="text-xs text-ink-faint">
            {advanceOverCap ? "Lower the advance to send this." : "Approvers are notified as soon as you send it."}
          </span>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <div className="border border-rule bg-card px-5 py-4">
          <div className="text-xs text-ink-soft">Estimated cost</div>
          <div className="num mt-1 text-2xl font-semibold tracking-tight text-ink">{formatINR(total)}</div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <Row label="You bear" value={formatINR(employeeBorne)} />
            <Row label="Company bears" value={formatINR(round2(total - employeeBorne))} />
            <Row label="Advance ceiling" value={formatINR(advanceCap)} />
          </dl>
        </div>

        <div className="border border-rule bg-card px-5 py-4">
          <div className="text-xs text-ink-soft">Who has to approve this</div>
          <ol className="mt-2 space-y-1.5">
            {chain.map((role, index) => (
              <li key={role} className="flex items-baseline gap-2 text-sm text-ink">
                <span className="ident text-ink-faint">{index + 1}</span>
                {role}
              </li>
            ))}
            <li className="flex items-baseline gap-2 text-sm text-ink-soft">
              <span className="ident text-ink-faint">{chain.length + 1}</span>
              Finance verification
            </li>
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            The chain follows the value you enter. It changes as the estimate crosses 25,000,
            75,000 and 2,00,000.
          </p>
        </div>
      </aside>
    </form>
  );
}

const inputClass =
  "w-full rounded-sm border border-rule-strong bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint";

function Field({
  label,
  hint,
  warn,
  children,
}: {
  label: string;
  hint?: string;
  warn?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink">{label}</span>
      {children}
      {warn ? (
        <span className="mt-1 block text-xs text-rust">{warn}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3")}>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="num text-ink">{value}</dd>
    </div>
  );
}
