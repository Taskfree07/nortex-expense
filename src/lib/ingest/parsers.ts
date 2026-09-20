/**
 * Rule-based readers for the formats this inbox actually contains.
 *
 * Deliberate design decision: the known senders (Uber, MakeMyTrip, the hotel,
 * Finance Shared Services) are read by rules, not by a model. They are
 * machine-generated and stable, rules are free and instant, and the numbers on
 * a claim should not move between runs. The model is kept for what rules cannot
 * do: photographed bills and formats we have never seen. See ../ai/gemini.ts.
 */

import { createHash } from "crypto";
import { parseINR, round2 } from "../money";
import { parseLooseDate, parseLooseDateTime, ymd } from "../dates";
import type { Classification, Extraction, ParsedDocument, RawEmail } from "./types";

type Rule = {
  name: string;
  matches: (email: RawEmail) => boolean;
  parse: (email: RawEmail) => { classification: Classification; confidence: number; extracted: Extraction };
};

const firstMatch = (text: string, re: RegExp): string | undefined => text.match(re)?.[1]?.trim();

/** merchant + amount + date + time + bill number: policy 5.3's reconciliation key. */
export function fingerprint(parts: {
  merchant?: string;
  amount?: number;
  occurredAt?: string;
  billNo?: string;
}): string | null {
  if (!parts.merchant || parts.amount === undefined) return null;
  const when = parts.occurredAt ? new Date(parts.occurredAt) : null;
  const key = [
    parts.merchant.toLowerCase().trim(),
    parts.amount.toFixed(2),
    when ? `${ymd(when)}T${when.toISOString().slice(11, 16)}` : "",
    (parts.billNo ?? "").toLowerCase(),
  ].join("|");
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ Uber */

const uberRule: Rule = {
  name: "uber",
  matches: (e) => /uber/i.test(e.from) || /with uber/i.test(e.subject),
  parse: (e) => {
    const body = e.body;
    const failed = /payment failed|could not charge/i.test(e.subject + body);
    const amount =
      parseINR(firstMatch(body, /Total\s+INR\s*([\d,]+\.?\d*)/i)) ??
      parseINR(firstMatch(body, /Amount due\s+INR\s*([\d,]+\.?\d*)/i));

    const when = body.match(/(\w{3},\s*\d{1,2}\s+\w{3}\s+\d{4})\s*\|\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    const occurredAt = when ? parseLooseDateTime(when[1], when[2]) : parseLooseDate(e.date);

    const riderName = firstMatch(body, /Thanks for riding,\s*([A-Za-z][A-Za-z\s.]*)/i);
    const isForward = /-+\s*Forwarded message\s*-+/i.test(body);

    const extracted: Extraction = {
      merchant: "Uber",
      amount: amount ?? undefined,
      currency: "INR",
      occurredAt: occurredAt?.toISOString(),
      pickup: firstMatch(body, /Pickup\s+(.+)/i),
      drop: firstMatch(body, /Drop\s+(.+)/i),
      paidBy: /Payment:\s*Personal/i.test(body) ? "Employee" : undefined,
      paymentInstrument: firstMatch(body, /Payment:\s*(.+)/i),
      riderName,
      forwardedBy: isForward ? e.from : undefined,
    };

    return {
      classification: failed ? "PAYMENT_FAILED" : "CAB_RECEIPT",
      confidence: amount ? 0.97 : 0.5,
      extracted,
    };
  },
};

/* ------------------------------------------------- MakeMyTrip flight ticket */

const flightRule: Rule = {
  name: "mmt-flight",
  matches: (e) => /e-?ticket/i.test(e.subject),
  parse: (e) => {
    const body = e.body;
    const sectors: NonNullable<Extraction["sectors"]> = [];
    const sectorRe =
      /([A-Za-z ]+)\s*-\s*([A-Za-z ]+)\s*\|\s*One Way\s*\|\s*\w{3},\s*(\d{1,2}\s+\w{3}\s+\d{4})([\s\S]*?)Total\s+INR\s*([\d,]+\.?\d*)/gi;
    let m: RegExpExecArray | null;
    while ((m = sectorRe.exec(body)) !== null) {
      sectors.push({
        from: m[1].trim(),
        to: m[2].trim(),
        date: parseLooseDate(m[3])?.toISOString(),
        flight: firstMatch(m[4], /([A-Z][a-zA-Z]*\s+\d[A-Z]-\d+)/),
        total: parseINR(m[5]) ?? 0,
      });
    }
    const total = round2(sectors.reduce((s, x) => s + x.total, 0));
    const corporate = /Corporate Card/i.test(body);

    return {
      classification: "FLIGHT_BOOKING",
      confidence: sectors.length ? 0.95 : 0.6,
      extracted: {
        merchant: firstMatch(e.from, /^(.*?)</)?.trim() || "MakeMyTrip",
        amount: total || undefined,
        currency: "INR",
        sectors,
        pnr: firstMatch(body, /PNR:\s*([A-Z0-9]+)/),
        cabinClass: /business class/i.test(body) ? "Business" : "Economy",
        paidBy: corporate ? "Company" : "Employee",
        paymentInstrument: firstMatch(body, /Payment:\s*(.+)/i),
        occurredAt: sectors[0]?.date,
      },
    };
  },
};

/* ------------------------------------------------- MakeMyTrip hotel voucher */

const hotelVoucherRule: Rule = {
  name: "mmt-hotel-voucher",
  matches: (e) => /hotel booking voucher/i.test(e.subject),
  parse: (e) => {
    const body = e.body;
    const hotelLine = firstMatch(body, /Your stay is confirmed\.\s*\n+\s*(.+)/i) ?? "";
    const parts = hotelLine.split(",").map((p) => p.trim());
    const payAtHotel = /pay at hotel/i.test(body);

    return {
      classification: "HOTEL_VOUCHER",
      confidence: 0.92,
      extracted: {
        merchant: parts[0] || "Hotel",
        hotel: hotelLine,
        city: parts[parts.length - 1],
        checkIn: parseLooseDate(firstMatch(body, /Check-in\s*:\s*\w{3},\s*(.+)/i))?.toISOString(),
        checkOut: parseLooseDate(firstMatch(body, /Check-out\s*:\s*\w{3},\s*(.+)/i))?.toISOString(),
        nights: Number(firstMatch(body, /Nights\s*:\s*(\d+)/i) ?? 0) || undefined,
        tariffPerNight: parseINR(firstMatch(body, /Tariff per night\s+INR\s*([\d,]+\.?\d*)/i)) ?? undefined,
        roomCharges: parseINR(firstMatch(body, /Total room charges\s+INR\s*([\d,]+\.?\d*)/i)) ?? undefined,
        taxTotal: parseINR(firstMatch(body, /GST\s*@?\s*\d*%?\s+INR\s*([\d,]+\.?\d*)/i)) ?? undefined,
        amount: parseINR(firstMatch(body, /Grand total\s+INR\s*([\d,]+\.?\d*)/i)) ?? undefined,
        // "Pay at Hotel" is the tell that the employee, not the company, settles this.
        paidBy: payAtHotel ? "Employee" : "Company",
        paymentInstrument: payAtHotel ? "Pay at Hotel" : firstMatch(body, /Mode of payment:\s*(.+)/i),
      },
    };
  },
};

/* --------------------------------------------------------- Hotel tax invoice */

const hotelInvoiceRule: Rule = {
  name: "hotel-invoice",
  matches: (e) => /tax invoice/i.test(e.subject) || /folio no/i.test(e.body),
  parse: (e) => {
    const body = e.body;
    const folioLines: NonNullable<Extraction["folioLines"]> = [];
    const lineRe = /^\s*([A-Za-z][A-Za-z ()\-/]+?)\s{2,}([\d,]+\.\d{2})\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(body)) !== null) {
      const description = m[1].trim();
      if (/^(sub total|subtotal|invoice total|total|cgst|sgst|igst|gst)/i.test(description)) continue;
      folioLines.push({ description, amount: parseINR(m[2]) ?? 0 });
    }

    const cgst = parseINR(firstMatch(body, /CGST\s*\d*%?\s+([\d,]+\.\d{2})/i)) ?? 0;
    const sgst = parseINR(firstMatch(body, /SGST\s*\d*%?\s+([\d,]+\.\d{2})/i)) ?? 0;
    const igst = parseINR(firstMatch(body, /IGST\s*\d*%?\s+([\d,]+\.\d{2})/i)) ?? 0;

    return {
      classification: "HOTEL_INVOICE",
      confidence: folioLines.length ? 0.93 : 0.55,
      extracted: {
        merchant: firstMatch(e.from, /^(.*?)</)?.trim() || "Hotel",
        invoiceNo:
          firstMatch(body, /Folio no\s+([A-Z0-9/\-]+)/i) ??
          firstMatch(e.subject, /Tax Invoice\s+([A-Z0-9/\-]+)/i),
        checkIn: parseLooseDate(
          firstMatch(body, /Check-?in\s+([\d]{1,2}\s+\w{3}\s+\d{4})/i),
        )?.toISOString(),
        checkOut: parseLooseDate(
          firstMatch(body, /Check-?out\s+([\d]{1,2}\s+\w{3}\s+\d{4})/i),
        )?.toISOString(),
        nights: Number(firstMatch(body, /Nights\s+(\d+)/i) ?? 0) || undefined,
        folioLines,
        subTotal: parseINR(firstMatch(body, /Sub ?total\s+([\d,]+\.\d{2})/i)) ?? undefined,
        taxTotal: round2(cgst + sgst + igst) || undefined,
        amount: parseINR(firstMatch(body, /Invoice total\s+([\d,]+\.\d{2})/i)) ?? undefined,
        paidBy: /settled by:?\s*guest/i.test(body) ? "Employee" : undefined,
        paymentInstrument: firstMatch(body, /Settled by:\s*(.+)/i),
        occurredAt: parseLooseDate(
          firstMatch(body, /Check-?out\s+([\d]{1,2}\s+\w{3}\s+\d{4})/i),
        )?.toISOString(),
      },
    };
  },
};

/* ------------------------------------------------------------------ Finance */

const advanceRule: Rule = {
  name: "advance",
  matches: (e) => /advance/i.test(e.subject) && /credited|disbursed/i.test(e.subject + e.body),
  parse: (e) => ({
    classification: "ADVANCE_DISBURSED",
    confidence: 0.96,
    extracted: {
      merchant: "Finance Shared Services",
      amount: parseINR(firstMatch(e.body, /advance of INR\s*([\d,]+\.?\d*)/i)) ?? undefined,
      advanceRef:
        firstMatch(e.subject, /Ref\s+([A-Z0-9/]+)/i) ?? firstMatch(e.body, /reference\s+([A-Z0-9/]+)/i),
      occurredAt: parseLooseDate(e.date)?.toISOString(),
    },
  }),
};

/* ------------------------------------------------- Internal approval traffic */

const travelRequestRule: Rule = {
  name: "travel-request",
  matches: (e) => /travel approval request/i.test(e.subject) && !/^re:/i.test(e.subject.trim()),
  parse: (e) => ({
    classification: "TRAVEL_REQUEST",
    confidence: 0.9,
    extracted: {
      destination: firstMatch(e.body, /travel to ([A-Za-z ]+?) from/i),
      estimatedSpend: parseINR(firstMatch(e.body, /Estimated spend:\s*INR\s*([\d,]+)/i)) ?? undefined,
      advanceRequested: parseINR(firstMatch(e.body, /Advance requested:\s*INR\s*([\d,]+)/i)) ?? undefined,
      occurredAt: parseLooseDate(e.date)?.toISOString(),
      notes: [firstMatch(e.body, /Purpose:\s*(.+)/i) ?? ""].filter(Boolean),
    },
  }),
};

const approvalGrantedRule: Rule = {
  name: "approval-granted",
  matches: (e) => /^re:\s*travel approval request/i.test(e.subject.trim()) && /approved/i.test(e.body),
  parse: (e) => ({
    classification: "TRAVEL_APPROVAL",
    confidence: 0.9,
    extracted: {
      merchant: firstMatch(e.from, /^(.*?)</)?.trim(),
      occurredAt: parseLooseDate(e.date)?.toISOString(),
      notes: ["Approved by " + (firstMatch(e.from, /^(.*?)</)?.trim() ?? e.from)],
    },
  }),
};

/* -------------------------------------------------------------- Marketing */

const promoRule: Rule = {
  name: "promo",
  matches: (e) =>
    /offers?@|noreply-promo|deals@/i.test(e.from) ||
    (/unsubscribe/i.test(e.body) && /(%\s*off|sale is live|use code)/i.test(e.body)),
  parse: () => ({
    classification: "PROMOTION",
    confidence: 0.98,
    extracted: { notes: ["Marketing mail - no claimable content"] },
  }),
};

/* ------------------------------- A bill the employee mailed to themselves */

const selfBillRule: Rule = {
  name: "self-mailed-bill",
  matches: (e) => e.attachments.length > 0 && /bill|invoice|receipt/i.test(e.subject),
  parse: (e) => {
    const covers = Number(firstMatch(e.body, /(\d+)\s*people/i) ?? 0) || undefined;
    const hosted = /dinner with|lunch with|hosted|customer|client|procurement|vertex/i.test(e.body);
    const org = firstMatch(e.body, /with ([A-Z][A-Za-z]+)\s+(?:procurement|team|management)/i);
    return {
      classification: hosted ? "ENTERTAINMENT_BILL" : "MEAL_BILL",
      confidence: 0.6, // the money is in the attachment - the image reader fills it in
      extracted: {
        covers,
        attendeeOrg: org,
        occurredAt: parseLooseDate(e.date)?.toISOString(),
        notes: [e.body.split("\n").find((l) => l.trim().length > 0) ?? ""],
      },
    };
  },
};

const RULES: Rule[] = [
  promoRule,
  uberRule,
  flightRule,
  hotelVoucherRule,
  hotelInvoiceRule,
  advanceRule,
  approvalGrantedRule,
  travelRequestRule,
  selfBillRule,
];

/**
 * Reads one email. `claimantEmail` and `claimantName` decide whether a receipt
 * belongs to the claimant at all - policy 4 bars expenses incurred by anyone else.
 */
export function parseEmail(email: RawEmail, claimant: { email: string; name: string }): ParsedDocument {
  const rule = RULES.find((r) => r.matches(email));
  const result = rule
    ? rule.parse(email)
    : { classification: "UNKNOWN" as Classification, confidence: 0.2, extracted: {} as Extraction };

  const doc: ParsedDocument = {
    filename: email.filename,
    source: "EMAIL",
    kind: "EMAIL",
    messageId: email.messageId,
    fromAddr: email.from,
    toAddr: email.to,
    subject: email.subject,
    sentAt: parseLooseDate(email.date),
    rawText: email.body,
    classification: result.classification,
    confidence: result.confidence,
    parsedBy: "rule",
    extracted: result.extracted,
    fingerprint: null,
    excluded: false,
  };

  applyOwnership(doc, claimant);

  if (
    !doc.excluded &&
    ["CAB_RECEIPT", "MEAL_BILL", "ENTERTAINMENT_BILL", "HOTEL_INVOICE"].includes(doc.classification)
  ) {
    doc.fingerprint = fingerprint({
      merchant: doc.extracted.merchant,
      amount: doc.extracted.amount,
      occurredAt: doc.extracted.occurredAt,
      billNo: doc.extracted.invoiceNo ?? doc.extracted.billNo,
    });
  }

  if (doc.classification === "PAYMENT_FAILED") {
    doc.excluded = true;
    doc.excludeReason =
      "Failed payment notice, not a receipt. The successful receipt for the same ride is claimed instead.";
  }
  if (doc.classification === "PROMOTION") {
    doc.excluded = true;
    doc.excludeReason = "Marketing mail.";
  }

  return doc;
}

/** Policy 4 - expenses incurred by any person other than the claimant. */
function applyOwnership(doc: ParsedDocument, claimant: { email: string; name: string }) {
  const firstName = claimant.name.split(" ")[0].toLowerCase();
  const rider = doc.extracted.riderName?.toLowerCase();
  const fromSomeoneElse =
    !doc.fromAddr.toLowerCase().includes(claimant.email.toLowerCase()) &&
    /nortexindustries\.com/i.test(doc.fromAddr) &&
    /forwarded message/i.test(doc.rawText);

  if (rider && !rider.includes(firstName)) {
    doc.classification = "THIRD_PARTY_EXPENSE";
    doc.excluded = true;
    doc.excludeReason = `Receipt is in the name of ${doc.extracted.riderName?.trim()}, not the claimant. Policy 4 bars expenses incurred by any person other than the claimant.`;
    return;
  }
  if (fromSomeoneElse && ["CAB_RECEIPT", "MEAL_BILL"].includes(doc.classification)) {
    doc.classification = "THIRD_PARTY_EXPENSE";
    doc.excluded = true;
    doc.excludeReason =
      "Forwarded from a colleague. Policy 4 bars expenses incurred by any person other than the claimant.";
  }
}

/**
 * Policy 5.3 - the same bill sent twice is one expense, not two.
 * The earliest copy wins; later copies point at it.
 */
export function markDuplicates(docs: ParsedDocument[]): ParsedDocument[] {
  const seen = new Map<string, ParsedDocument>();
  const ordered = [...docs].sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0));
  for (const doc of ordered) {
    if (!doc.fingerprint || doc.excluded) continue;
    const original = seen.get(doc.fingerprint);
    if (original) {
      doc.excluded = true;
      doc.excludeReason = `Duplicate of ${original.filename} - same merchant, amount, date and time (policy 5.3).`;
      (doc as ParsedDocument & { duplicateOf?: string }).duplicateOf = original.filename;
    } else {
      seen.set(doc.fingerprint, doc);
    }
  }
  return docs;
}
