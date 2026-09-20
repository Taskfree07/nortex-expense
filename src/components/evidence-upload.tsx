"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEvidence } from "@/app/actions";
import { buttonStyles } from "@/components/ui";
import { cn } from "@/lib/ui";

const ACCEPT = ".eml,.txt,.png,.jpg,.jpeg,.webp,.pdf";

/**
 * Where a real trip's evidence comes in: the emails from the travel desk and
 * the cab company, and photographs of the paper bills. Same pipeline as the
 * sample trip, so the policy checks that follow are the same ones.
 */
export function EvidenceUpload({ trqId, hasEvidence }: { trqId: string; hasEvidence: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function add(incoming: FileList | null) {
    if (!incoming) return;
    setError(null);
    setResult(null);
    setFiles((current) => [...current, ...Array.from(incoming)]);
  }

  async function send() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("trqId", trqId);
      for (const file of files) formData.append("files", file);
      const outcome = await uploadEvidence(formData);

      const parts = [`Read ${outcome.added} file${outcome.added === 1 ? "" : "s"}`];
      if (outcome.duplicates > 0) parts.push(`${outcome.duplicates} already on this trip`);
      if (outcome.unreadable > 0) parts.push(`${outcome.unreadable} needs you to price it`);
      setResult(parts.join(" · "));
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      router.push(`/claims/${outcome.claimId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Those files did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-stamp bg-stamp-wash" : "border-rule-strong bg-card",
        )}
      >
        <p className="text-sm text-ink">Drop this trip&apos;s emails and bills here</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-faint">
          Saved emails (.eml), photographs of bills, or PDFs. Each one is read, matched to this trip, and
          checked against the policy.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => add(e.target.files)}
          className="sr-only"
          id={`files-${trqId}`}
        />
        <label htmlFor={`files-${trqId}`} className={cn(buttonStyles.secondary, "mt-3 cursor-pointer")}>
          Choose files
        </label>
      </div>

      {files.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink">{file.name}</span>
              <span className="flex items-center gap-2 whitespace-nowrap text-ink-faint">
                {(file.size / 1024).toFixed(0)} KB
                <button
                  type="button"
                  onClick={() => setFiles((c) => c.filter((_, i) => i !== index))}
                  className="text-ink-faint hover:text-rust"
                >
                  remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rust">{error}</p> : null}
      {result ? <p className="mt-3 text-sm text-moss">{result}</p> : null}

      <button
        type="button"
        onClick={send}
        disabled={busy || files.length === 0}
        className={cn(buttonStyles.primary, "mt-3 w-full")}
      >
        {busy
          ? "Reading…"
          : files.length === 0
            ? hasEvidence
              ? "Add more evidence"
              : "Read my evidence"
            : `Read ${files.length} file${files.length === 1 ? "" : "s"}`}
      </button>
      {busy ? (
        <p className="mt-2 text-xs text-ink-faint">
          Photographed bills go to the model, which takes a few seconds each.
        </p>
      ) : null}
    </div>
  );
}
