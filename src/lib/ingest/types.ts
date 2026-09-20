/** What the inbox reader produces, before any policy is applied. */

export type Classification =
  | "TRAVEL_REQUEST"
  | "TRAVEL_APPROVAL"
  | "ADVANCE_DISBURSED"
  | "FLIGHT_BOOKING"
  | "HOTEL_VOUCHER"
  | "HOTEL_INVOICE"
  | "CAB_RECEIPT"
  | "MEAL_BILL"
  | "ENTERTAINMENT_BILL"
  | "PAYMENT_FAILED"
  | "PROMOTION"
  | "THIRD_PARTY_EXPENSE"
  | "UNKNOWN";

/** Classifications that can turn into money on a claim. */
export const CLAIMABLE: Classification[] = [
  "CAB_RECEIPT",
  "MEAL_BILL",
  "ENTERTAINMENT_BILL",
  "HOTEL_INVOICE",
];

export type RawEmail = {
  filename: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  body: string;
  attachments: { filename: string; path?: string }[];
};

export type FolioLine = { date?: string; description: string; amount: number };

export type Extraction = {
  merchant?: string;
  amount?: number;
  currency?: string;
  occurredAt?: string; // ISO
  /** Cab rides */
  pickup?: string;
  drop?: string;
  /** Flights */
  sectors?: { from: string; to: string; date?: string; flight?: string; total: number }[];
  pnr?: string;
  cabinClass?: string;
  /** Hotels */
  hotel?: string;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  tariffPerNight?: number;
  roomCharges?: number;
  folioLines?: FolioLine[];
  subTotal?: number;
  taxTotal?: number;
  invoiceNo?: string;
  /** Meals and entertainment */
  covers?: number;
  attendees?: string[];
  attendeeOrg?: string;
  billNo?: string;
  serviceCharge?: number;
  /** Advance */
  advanceRef?: string;
  /** Travel request and approval */
  estimatedSpend?: number;
  advanceRequested?: number;
  destination?: string;
  /** Payment */
  paidBy?: "Employee" | "Company";
  paymentInstrument?: string;
  /** Forwarded receipts */
  riderName?: string;
  forwardedBy?: string;
  notes?: string[];
};

export type ParsedDocument = {
  filename: string;
  source: "EMAIL" | "UPLOAD";
  kind: "EMAIL" | "RECEIPT_IMAGE";
  messageId?: string;
  fromAddr: string;
  toAddr: string;
  subject: string;
  sentAt: Date | null;
  rawText: string;
  imagePath?: string;
  classification: Classification;
  confidence: number;
  parsedBy: "rule" | "gemini" | "manual";
  extracted: Extraction;
  fingerprint?: string | null;
  excluded: boolean;
  excludeReason?: string;
};
