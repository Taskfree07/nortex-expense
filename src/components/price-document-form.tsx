"use client";

import { useState } from "react";
import { confirmDocument, dropDocument } from "@/app/actions";
import { buttonStyles } from "@/components/ui";

/**
 * What the employee says a bill was, when the reader could not price it.
 * The document stays attached as the proof reference, so this is a human
 * reading a bill the machine could not - not a line invented from nothing.
 */
export function PriceDocumentForm({ documentId, filename }: { documentId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 grid gap-2"
      action={async (formData) => {
        setBusy(true);
        setError(null);
        try {
          formData.set("documentId", documentId);
          await confirmDocument(formData);
        } catch (e) {
          setError(e instanceof Error ? e.message : "That did not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-xs text-ink-soft">
        What was it
        <input
          name="description"
          defaultValue={filename.replace(/\.[^.]+$/, "")}
          placeholder="Cab from the hotel to the airport"
          className={field}
          required
        />
      </label>
      <label className="text-xs text-ink-soft">
        Head
        <select name="head" className={field} defaultValue="Local conveyance">
          <option>Local conveyance</option>
          <option>Meals</option>
          <option>Lodging</option>
          <option>Business entertainment</option>
          <option>Air travel</option>
          <option>Other</option>
        </select>
      </label>
      <label className="text-xs text-ink-soft">
        Amount
        <input type="number" name="amount" min={0} step="0.01" className={field} required />
      </label>
      <label className="text-xs text-ink-soft">
        Date on the bill
        <input type="date" name="lineDate" className={field} />
      </label>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy} className={buttonStyles.primary}>
          {busy ? "Saving…" : "Add it to the claim"}
        </button>
        <button
          type="button"
          disabled={busy}
          className={buttonStyles.quiet}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const remove = new FormData();
              remove.set("documentId", documentId);
              await dropDocument(remove);
            } catch (e) {
              setError(e instanceof Error ? e.message : "That did not go through.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Not mine — remove it
        </button>
      </div>
      {error ? <p className="text-sm text-rust">{error}</p> : null}
    </form>
  );
}

const field =
  "mt-1 w-full rounded-sm border border-rule-strong bg-card px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint";
