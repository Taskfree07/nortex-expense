"use client";

import { useState } from "react";
import { addLine, clearFlag, confirmLine, recordAttendees, submit } from "@/app/actions";
import { buttonStyles } from "@/components/ui";

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return { error, busy, run };
}

export function SubmitClaimButton({ claimId, blocking }: { claimId: string; blocking: number }) {
  const { error, busy, run } = useAction();

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={busy || blocking > 0}
        className={buttonStyles.primary}
        title={blocking > 0 ? "Clear the blocking checks first" : undefined}
        onClick={() =>
          run(async () => {
            const formData = new FormData();
            formData.set("claimId", claimId);
            await submit(formData);
          })
        }
      >
        {busy ? "Filing…" : "File the settlement"}
      </button>
      <p className="mt-1.5 max-w-xs text-xs text-ink-faint">
        {blocking > 0
          ? `${blocking} check${blocking === 1 ? "" : "s"} must be cleared before this can be filed.`
          : "The figures become the actuals and the claim goes to its approvers."}
      </p>
      {error ? <p className="mt-2 text-sm text-rust">{error}</p> : null}
    </div>
  );
}

export function LineActions({ lineId, status }: { lineId: string; status: string }) {
  const { error, busy, run } = useAction();

  async function set(next: "CONFIRMED" | "REMOVED") {
    await run(async () => {
      const formData = new FormData();
      formData.set("lineId", lineId);
      formData.set("status", next);
      await confirmLine(formData);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "REMOVED" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => set("CONFIRMED")}
          className="text-xs text-stamp hover:underline"
        >
          Put back
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => set("REMOVED")}
          className="text-xs text-ink-faint hover:text-rust hover:underline"
        >
          Remove
        </button>
      )}
      {error ? <span className="text-xs text-rust">{error}</span> : null}
    </div>
  );
}

export function AttendeesForm({ lineId, attendees }: { lineId: string; attendees: string[] }) {
  const { error, busy, run } = useAction();
  const [value, setValue] = useState(attendees.join(", "));

  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-ink" htmlFor={`attendees-${lineId}`}>
        Who was at the table
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`attendees-${lineId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Name, organisation — separate people with commas"
          className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="button"
          disabled={busy || value.trim().length === 0}
          className={buttonStyles.secondary}
          onClick={() =>
            run(async () => {
              const formData = new FormData();
              formData.set("lineId", lineId);
              formData.set("attendees", value);
              await recordAttendees(formData);
            })
          }
        >
          {busy ? "Saving…" : "Record attendees"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-rust">{error}</p> : null}
    </div>
  );
}

export function ResolveFlagForm({ flagId }: { flagId: string }) {
  const { error, busy, run } = useAction();
  const [note, setNote] = useState("");

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done about it — this stays on the record"
          aria-label="What was done about it"
          className="min-w-0 flex-1 rounded-sm border border-rule-strong bg-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="button"
          disabled={busy || note.trim().length === 0}
          className={buttonStyles.secondary}
          onClick={() =>
            run(async () => {
              const formData = new FormData();
              formData.set("flagId", flagId);
              formData.set("note", note);
              await clearFlag(formData);
            })
          }
        >
          {busy ? "Clearing…" : "Clear this check"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-rust">{error}</p> : null}
    </div>
  );
}

export function AddLineForm({ claimId }: { claimId: string }) {
  const { error, busy, run } = useAction();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-stamp hover:underline">
        Add something the inbox missed
      </button>
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem_9rem_auto]"
      action={async (formData) => {
        await run(async () => {
          formData.set("claimId", claimId);
          await addLine(formData);
          setOpen(false);
        });
      }}
    >
      <label className="text-xs text-ink-soft">
        Date
        <input type="date" name="lineDate" className={fieldClass} required />
      </label>
      <label className="text-xs text-ink-soft">
        What it was
        <input name="description" placeholder="Cab, hotel to airport" className={fieldClass} required />
      </label>
      <label className="text-xs text-ink-soft">
        Head
        <select name="head" className={fieldClass} defaultValue="Local conveyance">
          <option>Local conveyance</option>
          <option>Meals</option>
          <option>Lodging</option>
          <option>Business entertainment</option>
          <option>Other</option>
        </select>
      </label>
      <label className="text-xs text-ink-soft">
        Amount
        <input type="number" name="gross" min={0} step="0.01" className={fieldClass} required />
      </label>
      <input type="hidden" name="section" value="OTHER" />
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy} className={buttonStyles.primary}>
          {busy ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonStyles.quiet}>
          Cancel
        </button>
      </div>
      {error ? <p className="text-sm text-rust sm:col-span-5">{error}</p> : null}
    </form>
  );
}

const fieldClass =
  "mt-1 w-full rounded-sm border border-rule-strong bg-card px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint";
