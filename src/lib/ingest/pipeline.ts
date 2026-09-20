/**
 * The inbox pipeline: .eml files and bill images in, classified and reconciled
 * documents out. This is the step that replaces the 25 minutes of typing.
 */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { parseEml } from "./eml";
import { markDuplicates, parseEmail, fingerprint } from "./parsers";
import { readReceiptImage } from "../ai/receipt-reader";
import type { Extraction, ParsedDocument, RawEmail } from "./types";

export type Claimant = { email: string; name: string };

export const PACK_DIR = path.join(process.cwd(), "data", "pack");

export async function ingestPack(claimant: Claimant, packDir = PACK_DIR): Promise<ParsedDocument[]> {
  const emailDir = path.join(packDir, "sample_emails");
  const files = (await readdir(emailDir)).filter((f) => f.endsWith(".eml")).sort();

  const docs: ParsedDocument[] = [];
  for (const file of files) {
    const raw = parseEml(file, await readFile(path.join(emailDir, file), "utf8"));
    docs.push(await ingestEmail(raw, claimant, packDir));
  }
  return markDuplicates(docs);
}

/** One email, plus any bill that came attached to it. */
export async function ingestEmail(
  raw: RawEmail,
  claimant: Claimant,
  packDir = PACK_DIR,
): Promise<ParsedDocument> {
  const doc = parseEmail(raw, claimant);

  for (const attachment of raw.attachments) {
    const relative = attachment.path ?? path.join("receipts", attachment.filename);
    const imagePath = path.join(packDir, relative);
    const reading = await readReceiptImage(imagePath);

    doc.imagePath = relative.replace(/\\/g, "/");
    doc.extracted = mergeExtractions(doc.extracted, reading.extracted);
    doc.parsedBy = reading.parsedBy;
    doc.confidence = Math.max(doc.confidence, reading.confidence);
    if (reading.error) doc.extracted.notes = [...(doc.extracted.notes ?? []), reading.error];

    // The image is what carries the money, so the key is rebuilt once it is read.
    doc.fingerprint = fingerprint({
      merchant: doc.extracted.merchant,
      amount: doc.extracted.amount,
      occurredAt: doc.extracted.occurredAt,
      billNo: doc.extracted.invoiceNo ?? doc.extracted.billNo,
    });
  }

  return doc;
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
