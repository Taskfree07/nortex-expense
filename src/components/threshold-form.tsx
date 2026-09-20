"use client";

import { useState } from "react";
import { updateThresholds } from "@/app/actions";
import { buttonStyles } from "@/components/ui";
import { formatINR } from "@/lib/money";

export function ThresholdForm({
  code,
  approvers,
}: {
  code: string;
  approvers: { level: number; role: string; thresholdAbove: number }[];
}) {
  const [rows, setRows] = useState(approvers);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2"
      action={async () => {
        setBusy(true);
        setError(null);
        try {
          const formData = new FormData();
          formData.set("code", code);
          formData.set("approvers", JSON.stringify(rows));
          await updateThresholds(formData);
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "That did not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {rows.map((row, index) => (
        <div key={row.role} className="grid grid-cols-[1.5rem_1fr_10rem] items-center gap-3">
          <span className="ident text-ink-faint">{row.level}</span>
          <span className="text-sm text-ink">{row.role}</span>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <span className="whitespace-nowrap">above</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={row.thresholdAbove}
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...row, thresholdAbove: Number(e.target.value) };
                setRows(next);
                setSaved(false);
              }}
              className="num w-full rounded-sm border border-rule-strong bg-card px-2 py-1 text-sm text-ink"
            />
          </label>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" disabled={busy} className={buttonStyles.secondary}>
          {busy ? "Saving…" : "Save thresholds"}
        </button>
        {saved ? <span className="text-xs text-moss">Saved. New claims use these.</span> : null}
        {error ? <span className="text-xs text-rust">{error}</span> : null}
        <span className="text-xs text-ink-faint">
          A claim of {formatINR(60000)} would need{" "}
          {rows.filter((r) => 60000 > r.thresholdAbove).map((r) => r.role).join(", ") || "no one"}.
        </span>
      </div>
    </form>
  );
}
