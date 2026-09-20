/**
 * The path a real trip takes: the employee's own files, not the pack's.
 *
 * These run without a Gemini key on purpose. A bill the reader cannot price has
 * to come back marked for the employee rather than guessed at, and that is the
 * behaviour worth pinning down - it is what stops a wrong number reaching a form.
 */

import { describe, expect, it } from "vitest";
import { ingestUploads } from "../ingest/pipeline";
import { runPolicyEngine } from "../policy/engine";
import type { UploadedFile } from "../ingest/pipeline";

const CLAIMANT = { email: "imran.qureshi@nortexindustries.com", name: "Imran Qureshi" };

const REQUEST = {
  trqId: "TRQ-2026-0099",
  destination: "Hyderabad",
  cityClass: "TIER_1" as const,
  fromDate: new Date("2026-10-05T00:00:00+05:30"),
  toDate: new Date("2026-10-08T00:00:00+05:30"),
  travelType: "DOMESTIC" as const,
  estimatedTotal: 37000,
  employeeBorneEstimate: 28000,
  advanceRequested: 12000,
  advanceDisbursed: 12000,
  approvedByRoles: ["Reporting Manager", "Head of Department"],
};

/**
 * An Uber receipt for this trip, in the shape the cab company actually sends.
 * `rideLine` is the date printed on the receipt itself - which is what the
 * parser reads, rather than the header date the mail happened to arrive on.
 */
function uberEmail(
  total: string,
  headerDate: string,
  rideLine: string,
  pickup: string,
  drop: string,
): UploadedFile {
  return {
    name: `uber-${rideLine.replace(/\W+/g, "-")}.eml`,
    bytes: Buffer.from(
      [
        "From: Uber Receipts <noreply@uber.com>",
        "To: Imran Qureshi <imran.qureshi@nortexindustries.com>",
        "Subject: Your trip with Uber",
        `Date: ${headerDate}`,
        "Message-ID: <uber-own-1@uber.com>",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        "Thanks for riding, Imran",
        "",
        `Total  INR ${total}`,
        "",
        rideLine,
        `Pickup   ${pickup}`,
        `Drop     ${drop}`,
        "Payment: Personal - HDFC Credit Card ****9921",
      ].join("\n"),
      "utf8",
    ),
  };
}

const RIDE_ON_TRIP = "Mon, 05 Oct 2026 | 07:10 AM";

describe("a trip that brings its own evidence", () => {
  it("reads an uploaded email and claims it against that trip", async () => {
    const docs = await ingestUploads(
      [
        uberEmail(
          "1,240.00",
          "Mon, 05 Oct 2026 07:30:00 +0530",
          RIDE_ON_TRIP,
          "Banjara Hills",
          "Hyderabad Airport",
        ),
      ],
      CLAIMANT,
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].classification).toBe("CAB_RECEIPT");
    expect(docs[0].source).toBe("UPLOAD");
    expect(docs[0].extracted.amount).toBe(1240);

    const result = runPolicyEngine({ request: REQUEST, documents: docs, submittedAt: new Date() });
    const line = result.lines.find((l) => l.head === "Local conveyance");
    expect(line?.allowed).toBe(1240);
    expect(result.totals.netClaim).toBe(1240);
    // Claimed 1,240 against a 12,000 advance: the balance comes back.
    expect(result.totals.recoverable).toBe(10760);
    expect(result.totals.payable).toBe(0);
  });

  it("catches the same bill uploaded twice", async () => {
    const first = uberEmail(
      "1,240.00",
      "Mon, 05 Oct 2026 07:30:00 +0530",
      RIDE_ON_TRIP,
      "Banjara Hills",
      "Hyderabad Airport",
    );
    const existing = await ingestUploads([first], CLAIMANT);

    const again = await ingestUploads([{ ...first, name: "forwarded-copy.eml" }], CLAIMANT, existing);
    expect(again[0].excluded).toBe(true);
    expect(again[0].excludeReason).toMatch(/Duplicate/i);
  });

  it("refuses to price a bill it cannot read, and blocks on it", async () => {
    const scan: UploadedFile = { name: "scan.png", bytes: Buffer.from("not really a png", "utf8") };
    const docs = await ingestUploads([scan], CLAIMANT);

    expect(docs[0].needsReview).toBe(true);
    expect(docs[0].classification).toBe("UNKNOWN");
    expect(docs[0].extracted.amount).toBeUndefined();

    // Nothing unreadable becomes money on its own.
    const result = runPolicyEngine({ request: REQUEST, documents: docs, submittedAt: new Date() });
    expect(result.totals.netClaim).toBe(0);
  });

  it("keeps another person's receipt off the claim, whoever uploads it", async () => {
    const someoneElse: UploadedFile = {
      name: "colleague.eml",
      bytes: Buffer.from(
        [
          "From: Uber Receipts <noreply@uber.com>",
          "To: Imran Qureshi <imran.qureshi@nortexindustries.com>",
          "Subject: Your trip with Uber",
          "Date: Tue, 06 Oct 2026 09:00:00 +0530",
          "Content-Type: text/plain; charset=UTF-8",
          "",
          "Thanks for riding, Deepa",
          "",
          "Total  INR 890.00",
          "Pickup   Gachibowli",
          "Drop     Hitec City",
        ].join("\n"),
        "utf8",
      ),
    };

    const docs = await ingestUploads([someoneElse], CLAIMANT);
    expect(docs[0].classification).toBe("THIRD_PARTY_EXPENSE");
    expect(docs[0].excluded).toBe(true);

    const result = runPolicyEngine({ request: REQUEST, documents: docs, submittedAt: new Date() });
    expect(result.totals.netClaim).toBe(0);
  });

  it("flags a bill dated outside the trip", async () => {
    const docs = await ingestUploads(
      [
        uberEmail(
          "640.00",
          "Tue, 12 May 2026 08:10:00 +0530",
          "Tue, 12 May 2026 | 08:10 AM",
          "Guindy",
          "Chennai Airport",
        ),
      ],
      CLAIMANT,
    );
    const result = runPolicyEngine({ request: REQUEST, documents: docs, submittedAt: new Date() });
    expect(result.flags.map((f) => f.code)).toContain("OUTSIDE_TRIP_DATES");
  });
});

describe("a bill whose reader hands back its tax as a line item", () => {
  /**
   * Seen from the model on a real run: the hotel folio came back with
   * "CGST 6% = 1152" and "SGST 6% = 1152" among the charges. The tax is already
   * carried in taxTotal, so counting those rows as charges too put 2,580.48 of
   * tax on the claim twice. A bill's own tax may only be paid once.
   */
  const folio = {
    filename: "folio.png",
    source: "UPLOAD" as const,
    kind: "RECEIPT_IMAGE" as const,
    fromAddr: "",
    toAddr: "",
    subject: "hotel folio",
    sentAt: new Date("2026-10-08T11:00:00+05:30"),
    rawText: "",
    classification: "HOTEL_INVOICE" as const,
    confidence: 0.9,
    parsedBy: "gemini" as const,
    fingerprint: null,
    excluded: false,
    extracted: {
      merchant: "Novotel Hyderabad",
      nights: 3,
      tariffPerNight: 5000,
      subTotal: 16500,
      taxTotal: 1980,
      amount: 18480,
      paidBy: "Employee" as const,
      checkIn: "2026-10-05T14:00:00+05:30",
      checkOut: "2026-10-08T11:00:00+05:30",
      folioLines: [
        { description: "Room Charge", amount: 5000 },
        { description: "Room Charge", amount: 5000 },
        { description: "Room Charge", amount: 5000 },
        { description: "Laundry", amount: 500 },
        { description: "CGST 6%", amount: 990 },
        { description: "SGST 6%", amount: 990 },
        { description: "Sub Total", amount: 16500 },
        { description: "Invoice Total", amount: 18480 },
      ],
    },
  };

  it("pays the tax once", () => {
    const result = runPolicyEngine({ request: REQUEST, documents: [folio], submittedAt: new Date() });

    // Room 15,000 + its 1,800 of tax; laundry 500 + 60 disallowed. Nothing else.
    const lodging = result.lines.find((l) => l.section === "LODGING");
    expect(lodging?.gross).toBe(16800);
    expect(result.totals.grossEmployee).toBe(17360);
    expect(result.totals.disallowed).toBe(560);
    expect(result.totals.netClaim).toBe(16800);

    // And no line was invented from a tax or total row.
    expect(result.lines.some((l) => /gst|total/i.test(l.description))).toBe(false);
  });
});
