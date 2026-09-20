/**
 * What a person is meant to DO about a policy check.
 *
 * The engine decides what is true. This decides who acts on it, which is a
 * different question and was the one the interface left unanswered: an employee
 * seeing six identical "clear this check" boxes cannot tell which are theirs.
 *
 * Only a BLOCK stops a settlement being filed. A WARN is written down for the
 * approver to weigh - the employee has nothing to do about the hotel being
 * booked over the cap after the fact, and pretending otherwise invites them to
 * type something meaningless to get past it.
 */

export type Resolution =
  /** The employee clears it by saying what was done. */
  | { by: "NOTE"; instruction: string }
  /** It clears itself once the employee does something specific. */
  | { by: "ACTION"; instruction: string }
  /** Nobody clears it: it travels with the claim for the approver to see. */
  | { by: "APPROVER"; instruction: string };

const BY_CODE: Record<string, Resolution> = {
  ENTERTAINMENT_ATTENDEES_MISSING: {
    by: "ACTION",
    instruction: "Add the names and organisation on the dinner line, and this clears itself.",
  },
  ENTERTAINMENT_PRIOR_APPROVAL: {
    by: "NOTE",
    instruction: "Say how it was approved - who agreed to it and when - or remove the line.",
  },
  DOCUMENT_NEEDS_REVIEW: {
    by: "ACTION",
    instruction: "Price the bill in the evidence list below, or remove it.",
  },
  MISSING_PROOF: {
    by: "NOTE",
    instruction: "Attach the bill, or say where the proof is. A line without one is sent back.",
  },
  AMOUNT_NOT_READ: {
    by: "ACTION",
    instruction: "Enter the amount on the line, or remove it.",
  },
  UNCLASSIFIED_FOLIO_LINE: {
    by: "NOTE",
    instruction: "Confirm what this charge was, or remove the line.",
  },
};

/** Anything a reviewer weighs rather than the claimant fixes. */
const FOR_THE_APPROVER: Record<string, string> = {
  LODGING_CAP_EXCEEDED: "The excess is already out of the claim. Your approver sees the reason.",
  MEAL_CAP_EXCEEDED: "The excess is already out of the claim.",
  ADVANCE_ABOVE_CAP: "A Finance matter on the advance, not something to fix on this claim.",
  REQUEST_APPROVAL_INCOMPLETE: "Raised against the original request. Your approver decides.",
  LODGING_GAP: "If a night is genuinely missing, add the bill. Otherwise leave it - it is only noted.",
  MISSING_RETURN_TRANSFER: "Add the receipt if there was one. Otherwise leave it.",
  OUTSIDE_TRIP_DATES: "Check the date is right. If it is, your approver will see why it stands out.",
  LATE_SUBMISSION: "Nothing to do - the date is the date.",
  CLAIM_ABOVE_ESTIMATE_BAND: "It simply means one more approver joins the chain.",
  MULTIPLE_MEALS_SAME_DAY: "Within the daily cap, so nothing to do.",
  NON_ECONOMY_FLIGHT: "Your approver decides whether to allow it.",
  ALCOHOL_ON_ENTERTAINMENT: "Allowed on an approved entertainment claim. Your approver sees it.",
};

export function resolutionFor(code: string, severity: string): Resolution {
  const direct = BY_CODE[code];
  if (direct) return direct;

  const approver = FOR_THE_APPROVER[code];
  if (approver) return { by: "APPROVER", instruction: approver };

  // A blocking check nobody has written guidance for still has to be clearable,
  // or a claim could get stuck with no way forward.
  return severity === "BLOCK"
    ? { by: "NOTE", instruction: "Say what was done about it before you file." }
    : { by: "APPROVER", instruction: "Noted for your approver." };
}
