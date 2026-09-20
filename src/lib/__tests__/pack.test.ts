/**
 * The pack is the specification, so the pack is the test.
 *
 * Every number below was worked out by hand from the 15 emails, the two bills
 * and NTX-HR-POL-11 before the engine existed. If the engine ever disagrees with
 * this file, the engine is wrong.
 */

import { describe, expect, it } from "vitest";
import path from "path";
import { ingestPack } from "../ingest/pipeline";
import { runPolicyEngine } from "../policy/engine";
import { resolveApprovalChain, type Person } from "../policy/approvals";
import { ymd } from "../dates";

const PACK = path.join(process.cwd(), "data", "pack");
const CLAIMANT = { email: "chaitanya.reddy@nortexindustries.com", name: "Chaitanya Reddy" };

const REQUEST = {
  trqId: "TRQ-2026-0001",
  destination: "Bengaluru",
  cityClass: "TIER_1" as const,
  fromDate: new Date("2026-06-16T00:00:00+05:30"),
  toDate: new Date("2026-06-20T00:00:00+05:30"),
  travelType: "DOMESTIC" as const,
  estimatedTotal: 43500,
  employeeBorneEstimate: 10000, // per the Travel Request Form: conveyance 4,000 + meals 6,000
  advanceRequested: 20000,
  advanceDisbursed: 20000,
  approvedByRoles: ["Reporting Manager"], // only Suresh replied "Approved"
};

async function run() {
  const documents = await ingestPack(CLAIMANT, PACK);
  const result = runPolicyEngine({
    request: REQUEST,
    documents,
    submittedAt: new Date("2026-06-22T10:00:00+05:30"),
  });
  return { documents, result };
}

describe("reading the inbox", () => {
  it("classifies all 15 messages", async () => {
    const { documents } = await run();
    expect(documents).toHaveLength(15);
    const byFile = Object.fromEntries(documents.map((d) => [d.filename, d.classification]));

    expect(byFile["01_travel_approval_request.eml"]).toBe("TRAVEL_REQUEST");
    expect(byFile["02_travel_approval_granted.eml"]).toBe("TRAVEL_APPROVAL");
    expect(byFile["03_advance_disbursed.eml"]).toBe("ADVANCE_DISBURSED");
    expect(byFile["04_flight_eticket.eml"]).toBe("FLIGHT_BOOKING");
    expect(byFile["05_hotel_voucher.eml"]).toBe("HOTEL_VOUCHER");
    expect(byFile["06_uber_receipt_1.eml"]).toBe("CAB_RECEIPT");
    expect(byFile["07_uber_receipt_2.eml"]).toBe("CAB_RECEIPT");
    expect(byFile["08_uber_payment_failed.eml"]).toBe("PAYMENT_FAILED");
    expect(byFile["09_uber_receipt_3.eml"]).toBe("CAB_RECEIPT");
    expect(byFile["11_dinner_bill.eml"]).toBe("ENTERTAINMENT_BILL");
    expect(byFile["12_hotel_invoice.eml"]).toBe("HOTEL_INVOICE");
    expect(byFile["13_colleague_forward.eml"]).toBe("THIRD_PARTY_EXPENSE");
    expect(byFile["14_promo_noise.eml"]).toBe("PROMOTION");
    expect(byFile["15_return_cab.eml"]).toBe("CAB_RECEIPT");
  });

  it("keeps the failed payment, the resend and the colleague's ride out of the claim", async () => {
    const { documents } = await run();
    const excluded = documents.filter((d) => d.excluded).map((d) => d.filename);

    expect(excluded).toContain("08_uber_payment_failed.eml"); // a notice, not a receipt
    expect(excluded).toContain("10_uber_receipt_3_resend.eml"); // policy 5.3 duplicate
    expect(excluded).toContain("13_colleague_forward.eml"); // policy 4, someone else
    expect(excluded).toContain("14_promo_noise.eml"); // marketing

    // The genuine 17 Jun ride survives exactly once, at 172.
    const kept = documents.filter((d) => d.classification === "CAB_RECEIPT" && !d.excluded);
    expect(kept).toHaveLength(4);
    expect(kept.filter((d) => d.extracted.amount === 172)).toHaveLength(1);
  });

  it("dates every receipt in IST, not UTC", async () => {
    const { documents } = await run();
    const byFile = Object.fromEntries(
      documents.map((d) => [d.filename, d.extracted.occurredAt ? ymd(new Date(d.extracted.occurredAt)) : null]),
    );

    // The 05:20 airport run is on the 16th in Delhi and Bengaluru alike; reading
    // it off a UTC timestamp would put it on the 15th and drop it out of the trip.
    expect(byFile["06_uber_receipt_1.eml"]).toBe("2026-06-16");
    expect(byFile["07_uber_receipt_2.eml"]).toBe("2026-06-16");
    expect(byFile["09_uber_receipt_3.eml"]).toBe("2026-06-17");
    expect(byFile["15_return_cab.eml"]).toBe("2026-06-20");
  });

  it("reads the two photographed bills", async () => {
    const { documents } = await run();
    const dinner = documents.find((d) => d.filename === "11_dinner_bill.eml");
    const hotel = documents.find((d) => d.filename === "12_hotel_invoice.eml");

    expect(dinner?.extracted.amount).toBe(2255);
    expect(dinner?.extracted.covers).toBe(4);
    expect(hotel?.extracted.amount).toBe(21504);
    expect(hotel?.extracted.folioLines?.length).toBe(6);
  });
});

describe("applying the policy", () => {
  it("splits the hotel folio into room, meal and non-reimbursable", async () => {
    const { result } = await run();
    const lodging = result.lines.find((l) => l.section === "LODGING");
    expect(lodging?.gross).toBe(19320); // 17,250 room + 2,070 tax on the room
    expect(lodging?.disallowed).toBe(0); // 5,750/night is inside the Tier-1 6,000 cap

    const nonReimbursable = result.lines.filter((l) => l.head === "Non-reimbursable");
    const disallowed = nonReimbursable.reduce((s, l) => s + l.gross, 0);
    expect(disallowed).toBeCloseTo(929.6, 2); // laundry 450 + mini bar 380, with their 12% GST

    const meals = result.lines.filter((l) => l.head === "Meals");
    expect(meals).toHaveLength(1);
    expect(meals[0].allowed).toBeCloseTo(1254.4, 2); // in-room dining 1,120 + tax
  });

  it("records the flights as company-borne and reimburses nothing for them", async () => {
    const { result } = await run();
    const flights = result.lines.filter((l) => l.head === "Air travel");
    expect(flights).toHaveLength(2);
    expect(flights.every((l) => l.paidBy === "Company")).toBe(true);
    expect(result.totals.grossCompany).toBe(10556); // 5,016 + 5,540
  });

  it("arrives at the settlement figures", async () => {
    const { result } = await run();
    expect(result.totals.grossEmployee).toBeCloseTo(27318.04, 2);
    expect(result.totals.disallowed).toBeCloseTo(929.6, 2);
    expect(result.totals.netClaim).toBeCloseTo(26388.44, 2);
    expect(result.totals.advanceApplied).toBe(20000);
    expect(result.totals.payable).toBeCloseTo(6388.44, 2);
    expect(result.totals.recoverable).toBe(0);
  });

  it("raises the flags a reviewer must see", async () => {
    const { result } = await run();
    const codes = result.flags.map((f) => f.code);

    expect(codes).toContain("ENTERTAINMENT_PRIOR_APPROVAL"); // 2,255 > 2,000, no HoD sign-off
    expect(codes).toContain("ENTERTAINMENT_ATTENDEES_MISSING"); // names and organisation absent
    expect(codes).toContain("LODGING_GAP"); // 4 trip nights, 3 nights of hotel
    expect(codes).toContain("ADVANCE_ABOVE_CAP"); // 20,000 against a 60% ceiling
    expect(codes).toContain("REQUEST_APPROVAL_INCOMPLETE"); // only the Reporting Manager approved
    expect(codes).toContain("DUPLICATE_BILL");
    expect(codes).toContain("THIRD_PARTY_EXPENSE");
    expect(codes).toContain("MISSING_RETURN_TRANSFER");
  });

  it("keeps meals inside the daily cap", async () => {
    const { result } = await run();
    expect(result.mealAllowance.days).toBe(5); // 16 to 20 Jun, travel days count in full
    expect(result.mealAllowance.cap).toBe(7500); // Tier 1, 1,500/day
    expect(result.mealAllowance.claimed).toBeCloseTo(1254.4, 2);
  });

  it("pays on the next run after filing", async () => {
    const { result } = await run();
    expect(ymd(result.dueBy)).toBe("2026-06-27"); // 7 calendar days from the return date
    expect(ymd(result.paymentRunDate)).toBe("2026-06-25"); // filed on 22 Jun, so the 25th run
  });
});

describe("the approval chain", () => {
  const people = new Map<string, Person>(
    (
      [
        ["NX-4471", "Chaitanya Reddy", "Manager - Key Accounts", "Employee", "NX-2210"],
        ["NX-2210", "Suresh Iyer", "Deputy General Manager", "Reporting Manager", "NX-1108"],
        ["NX-1108", "Meera Krishnan", "Head of Department - Sales", "Head of Department", "NX-1002"],
        ["NX-1002", "Arvind Rao", "Head of Division - Commercial", "Head of Division", "NX-1000"],
        ["NX-1000", "Nandita Shah", "Managing Director", "MD", null],
        ["NX-3305", "Ravi Menon", "Manager - Finance Shared Services", "Finance", "NX-3300"],
        ["NX-3300", "Kavitha Balan", "Controller", "Finance", "NX-1002"],
      ] as const
    ).map(([empCode, name, designation, role, managerCode]) => [
      empCode,
      { empCode, name, email: "", designation, department: "", role, managerCode },
    ]),
  );

  it("needs the manager and the head of department for a 26,388 claim", async () => {
    const { result } = await run();
    expect(result.approvalChainRoles).toEqual(["Reporting Manager", "Head of Department"]);

    const chain = resolveApprovalChain(people.get("NX-4471")!, people, result.approvalChainRoles, "test");
    expect(chain.map((s) => s.approverName)).toEqual([
      "Suresh Iyer",
      "Meera Krishnan",
      "Ravi Menon", // Finance verification, on every claim
      "Kavitha Balan", // payment release
    ]);
  });

  it("skips the level the claimant holds (policy 2.2)", () => {
    // Suresh claims: he is his own reports' Reporting Manager, so that level drops out.
    const chain = resolveApprovalChain(
      people.get("NX-2210")!,
      people,
      ["Reporting Manager", "Head of Department"],
      "test",
    );
    expect(chain[0].approverName).toBe("Meera Krishnan");
    expect(chain.some((s) => s.skipped)).toBe(false);
  });
});
