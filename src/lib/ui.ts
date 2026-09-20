import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** How a claim's state reads to a person, and the colour that carries it. */
export const CLAIM_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "stamp" },
  UNDER_REVIEW: { label: "Under review", tone: "stamp" },
  RETURNED: { label: "Sent back to you", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "rust" },
  VERIFIED: { label: "Approved", tone: "moss" },
  QUEUED_FOR_PAYMENT: { label: "Queued for payment", tone: "moss" },
  PAID: { label: "Paid", tone: "moss" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "amber" },
  APPROVED: { label: "Approved", tone: "moss" },
  RETURNED: { label: "Sent back", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "rust" },
  SETTLED: { label: "Settled", tone: "moss" },
};

export type Tone = "neutral" | "stamp" | "amber" | "rust" | "moss";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-paper text-ink-soft ring-rule-strong",
  stamp: "bg-stamp-wash text-stamp ring-stamp/30",
  amber: "bg-amber-wash text-amber ring-amber/30",
  rust: "bg-rust-wash text-rust ring-rust/30",
  moss: "bg-moss-wash text-moss ring-moss/30",
};

export const SEVERITY_TONE: Record<string, Tone> = {
  BLOCK: "rust",
  WARN: "amber",
  INFO: "stamp",
};

/** Plain-language names for what the reader found in the inbox. */
export const CLASSIFICATION_LABEL: Record<string, string> = {
  TRAVEL_REQUEST: "Travel request",
  TRAVEL_APPROVAL: "Approval",
  ADVANCE_DISBURSED: "Advance credited",
  FLIGHT_BOOKING: "Flight ticket",
  HOTEL_VOUCHER: "Hotel booking",
  HOTEL_INVOICE: "Hotel bill",
  CAB_RECEIPT: "Cab receipt",
  MEAL_BILL: "Meal bill",
  ENTERTAINMENT_BILL: "Customer dinner",
  PAYMENT_FAILED: "Failed payment notice",
  PROMOTION: "Marketing mail",
  THIRD_PARTY_EXPENSE: "Someone else's expense",
  UNKNOWN: "Not recognised",
};
