/**
 * The inbox pipeline: .eml files and bill images in, classified and reconciled
 * documents out. This is the step that replaces the 25 minutes of typing.
 *
 * Two ways in, one path through:
 *   - ingestPack        the sample trip that ships with the app
 *   - ingestUploads     whatever the employee drags onto their own trip
 * Both produce the same ParsedDocument, so the policy engine cannot tell them
 * apart and there is only one set of rules to trust.
 */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { parseEml } from "./eml";
import { markDuplicates, parseEmail, fingerprint } from "./parsers";
import { mimeFor, readReceiptBytes, readReceiptImage, verifiedReading } from "../ai/receipt-reader";
import type { Classification, Extraction, ParsedDocument, RawEmail } from "./types";

export type Claimant = { email: string; name: string };
export type UploadedFile = { name: string; bytes: Buffer };

export const PACK_DIR = path.join(process.cwd(), "data", "pack");

const EMAIL_EXTENSIONS = [".eml", ".msg", ".txt"];
const BILL_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];

export async function ingestPack(claimant: Claimant, packDir = PACK_DIR): Promise<ParsedDocument[]> {
  const emailDir = path.join(packDir, "sample_emails");
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".eml")).sort();

  // The messages are independent, and the two with bills attached each wait on a
  // model call. Reading them together keeps a trip's import inside the few
  // seconds a person will sit through, rather than the sum of every call.
  const docs = await Promise.all(
    files.map(async (file) => {
      const raw = parseEml(file, await readFile(path.join(emailDir, file), "utf8"));
      return ingestEmail(raw, claimant, packDir);
    }),
  );

  // Duplicate detection is order-sensitive, so it runs once they are all in.
  return markDuplicates(docs);
}

/**
 * What the employee dropped on their own trip. `existing` is everything already
 * on that Travel Request ID, so a bill uploaded twice is caught against what is
 * already there and not just against the rest of this batch.
 */
export async function ingestUploads(
  files: UploadedFile[],
  claimant: Claimant,
  existing: ParsedDocument[] = [],
): Promise<ParsedDocument[]> {
  const fresh = await Promise.all(files.map((file) => ingestUpload(file, claimant)));
  markDuplicates([...existing, ...fresh]);
  return fresh;
}

async function ingestUpload(file: UploadedFile, claimant: Claimant): Promise<ParsedDocument> {
  const extension = path.extname(file.name).toLowerCase();

  if (EMAIL_EXTENSIONS.includes(extension)) {
    const raw = parseEml(file.name, file.bytes.toString("utf8"));
    const doc = await ingestEmail(raw, claimant);
    doc.source = "UPLOAD";
    return doc;
  }

  if (BILL_EXTENSIONS.includes(extension)) {
    return billFromUpload(file, claimant);
  }

  return unreadable(file, `${extension || "This file type"} is not something the reader handles.`);
}

/** A photographed or PDF bill with no email around it. */
async function billFromUpload(file: UploadedFile, claimant: Claimant): Promise<ParsedDocument> {
  const mime = mimeFor(file.name);
  // The two bills that ship with the pack have readings taken from the images
  // themselves. If one of them is uploaded by hand, it is the same bill, so the
  // same fallback applies when the model cannot be reached.
  const reading = await readReceiptBytes(file.bytes, mime, verifiedReading(file.name));
  const extracted = reading.extracted;
  const classification = classifyBill(extracted);

  const doc: ParsedDocument = {
    filename: file.name,
    source: "UPLOAD",
    kind: "RECEIPT_IMAGE",
    fromAddr: claimant.email,
    toAddr: claimant.email,
    subject: extracted.merchant ? `${extracted.merchant} - uploaded bill` : file.name,
    sentAt: extracted.occurredAt ? new Date(extracted.occurredAt) : null,
    rawText: reading.raw ?? "",
    classification,
    confidence: reading.confidence,
    parsedBy: reading.parsedBy,
    extracted: { ...extracted, paidBy: extracted.paidBy ?? "Employee" },
    fileBase64: file.bytes.toString("base64"),
    mimeType: mime,
    fingerprint: null,
    excluded: false,
    // Nothing is claimed off a bill we could not put a number to.
    needsReview: classification === "UNKNOWN" || extracted.amount === undefined,
  };

  if (reading.error) doc.extracted.notes = [...(doc.extracted.notes ?? []), reading.error];
  if (doc.needsReview) {
    doc.extracted.notes = [
      ...(doc.extracted.notes ?? []),
      "Could not read an amount from this bill. Enter what it was and what it cost.",
    ];
  }

  doc.fingerprint = fingerprintOf(doc);
  return doc;
}

/** The model's own label, mapped onto the classifications the engine acts on. */
function classifyBill(extracted: Extraction): Classification {
  const byType: Record<string, Classification> = {
    HOTEL_INVOICE: "HOTEL_INVOICE",
    MEAL_BILL: "MEAL_BILL",
    ENTERTAINMENT_BILL: "ENTERTAINMENT_BILL",
    CAB_RECEIPT: "CAB_RECEIPT",
    FLIGHT_TICKET: "FLIGHT_BOOKING",
  };
  const stated = extracted.documentType ? byType[extracted.documentType] : undefined;
  if (stated) return stated;

  // No usable label: infer only from things that are unambiguous, and give up
  // rather than guess. An unknown document is shown to the employee.
  if (extracted.nights || extracted.checkIn) return "HOTEL_INVOICE";
  if (extracted.pickup && extracted.drop) return "CAB_RECEIPT";
  if (extracted.covers && extracted.covers > 1) return "ENTERTAINMENT_BILL";
  return "UNKNOWN";
}

function unreadable(file: UploadedFile, why: string): ParsedDocument {
  return {
    filename: file.name,
    source: "UPLOAD",
    kind: "RECEIPT_IMAGE",
    fromAddr: "",
    toAddr: "",
    subject: file.name,
    sentAt: null,
    rawText: "",
    classification: "UNKNOWN",
    confidence: 0,
    parsedBy: "rule",
    extracted: { notes: [why] },
    fileBase64: file.bytes.toString("base64"),
    mimeType: mimeFor(file.name),
    fingerprint: null,
    excluded: false,
    needsReview: true,
  };
}

/** One email, plus any bill that came attached to it. */
export async function ingestEmail(
  raw: RawEmail,
  claimant: Claimant,
  packDir = PACK_DIR,
): Promise<ParsedDocument> {
  const doc = parseEmail(raw, claimant);

  for (const attachment of raw.attachments) {
    const reading = attachment.content
      ? await readReceiptBytes(attachment.content, attachment.mime ?? mimeFor(attachment.filename))
      : await readReceiptImage(
          path.join(packDir, attachment.path ?? path.join("receipts", attachment.filename)),
        );

    if (attachment.content) {
      doc.fileBase64 = attachment.content.toString("base64");
      doc.mimeType = attachment.mime ?? mimeFor(attachment.filename);
    } else {
      doc.imagePath = (attachment.path ?? path.join("receipts", attachment.filename)).replace(/\\/g, "/");
    }

    doc.extracted = mergeExtractions(doc.extracted, reading.extracted);
    doc.parsedBy = reading.parsedBy;
    doc.confidence = Math.max(doc.confidence, reading.confidence);
    if (reading.error) doc.extracted.notes = [...(doc.extracted.notes ?? []), reading.error];

    // The image is what carries the money, so the key is rebuilt once it is read.
    doc.fingerprint = fingerprintOf(doc);
  }

  return doc;
}

function fingerprintOf(doc: ParsedDocument): string | null {
  return fingerprint({
    merchant: doc.extracted.merchant,
    amount: doc.extracted.amount,
    occurredAt: doc.extracted.occurredAt,
    billNo: doc.extracted.invoiceNo ?? doc.extracted.billNo,
  });
}

/**
 * The email wins where it already knows something; the image fills the gaps.
 * The exception is itemisation: the bill itself is the authoritative document,
 * so a longer line-item list from the image replaces the email's summary.
 */
function mergeExtractions(base: Extraction, incoming: Extraction): Extraction {
  const merged: Extraction = { ...base };
  for (const [key, value] of Object.entries(incoming) as [keyof Extraction, unknown][]) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const current = merged[key];
    const currentIsEmpty =
      current === undefined || current === null || (Array.isArray(current) && current.length === 0);
    const richerList = Array.isArray(value) && Array.isArray(current) && value.length > current.length;
    if (currentIsEmpty || richerList) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
