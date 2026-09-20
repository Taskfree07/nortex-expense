"use client";

import { useState } from "react";
import { buttonStyles } from "@/components/ui";

/**
 * Approve, send back, or reject. Sending back and rejecting both demand remarks
 * (policy 2.3), so the button stays disabled until there is something to say.
 */
export function DecisionForm({
  action,
  stepId,
  claimId,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  stepId: string;
  claimId?: string;
  label: string;
}) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function run(decision: string) {
    setError(null);
    setPending(decision);
    const formData = new FormData();
    formData.set("stepId", stepId);
    if (claimId) formData.set("claimId", claimId);
    formData.set("decision", decision);
    formData.set("remarks", remarks);
    try {
      await action(formData);
      setRemarks("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setPending(null);
    }
  }

  const needsRemarks = remarks.trim().length === 0;

  return (
    <div>
      <label className="block text-xs font-medium text-ink" htmlFor={`remarks-${stepId}`}>
        {label}
      </label>
      <textarea
        id={`remarks-${stepId}`}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={2}
        placeholder="Remarks. Required if you send it back or reject it."
        className="mt-1.5 w-full rounded-sm border border-rule-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
      />
      {error ? <p className="mt-2 text-sm text-rust">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("APPROVED")}
          disabled={pending !== null}
          className={buttonStyles.primary}
        >
          {pending === "APPROVED" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => run("RETURNED")}
          disabled={pending !== null || needsRemarks}
          className={buttonStyles.secondary}
          title={needsRemarks ? "Say what needs fixing first" : undefined}
        >
          Send back for correction
        </button>
        <button
          type="button"
          onClick={() => run("REJECTED")}
          disabled={pending !== null || needsRemarks}
          className={buttonStyles.danger}
          title={needsRemarks ? "Say why first" : undefined}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
