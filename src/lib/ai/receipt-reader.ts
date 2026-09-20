/**
 * Reads a photographed bill into structured fields.
 *
 * Gemini 2.5 Flash (free tier) does the reading when GEMINI_API_KEY is set.
 * Without a key - or if the call fails, times out or comes back malformed - the
 * app falls back to verified readings of the two bills shipped in the pack, so a
 * demo never depends on a network call. Either way the employee confirms the
 * numbers before they reach a claim: assistance, not autopilot.
 */

import { readFile } from "fs/promises";
import path from "path";
import { parseINR, round2 } from "../money";
import { parseLooseDate } from "../dates";
import type { Extraction } from "../ingest/types";

export type ReceiptReading = {
  extracted: Extraction;
  parsedBy: "gemini" | "rule";
  confidence: number;
  raw?: string;
  error?: string;
};

const PROMPT = `You are reading an Indian expense bill for a corporate travel claim.
Return ONLY a JSON object, no prose, with these keys (omit what is not on the bill):
{
  "documentType": "HOTEL_INVOICE" | "MEAL_BILL" | "CAB_RECEIPT" | "OTHER",
  "merchant": string,
  "city": string,
  "billNo": string,
  "invoiceNo": string,
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "covers": number,
  "lineItems": [{ "description": string, "amount": number }],
  "subTotal": number,
  "taxTotal": number,
  "serviceCharge": number,
  "total": number,
  "paymentInstrument": string,
  "checkIn": "YYYY-MM-DD",
  "checkOut": "YYYY-MM-DD",
  "nights": number,
  "tariffPerNight": number
}
Amounts are plain numbers without separators. Copy every line item exactly as printed,
including personal items such as laundry or mini bar - they are needed to disallow them.`;

/** Readings of the two bills in the pack, transcribed from the images themselves. */
const VERIFIED: Record<string, Extraction> = {
  "dinner_bill_18jun.png": {
    merchant: "Spice Terrace",
    city: "Whitefield, Bengaluru",
    billNo: "4471",
    occurredAt: "2026-06-18T21:38:00+05:30",
    covers: 4,
    folioLines: [
      { description: "2 x Paneer Tikka", amount: 760 },
      { description: "1 x Andhra Chicken", amount: 420 },
      { description: "4 x Butter Naan", amount: 320 },
      { description: "1 x Dal Makhani", amount: 310 },
      { description: "2 x Fresh Lime Soda", amount: 240 },
    ],
    subTotal: 2050,
    taxTotal: 102.5,
    serviceCharge: 102.5,
    amount: 2255,
    paymentInstrument: "CARD ****2288",
    paidBy: "Employee",
    currency: "INR",
  },
  "hotel_invoice_1188.png": {
    merchant: "Keys Prime Whitefield",
    city: "Bengaluru",
    invoiceNo: "KPW/26-27/1188",
    checkIn: "2026-06-16T14:10:00+05:30",
    checkOut: "2026-06-19T11:05:00+05:30",
    nights: 3,
    tariffPerNight: 5750,
    folioLines: [
      { date: "2026-06-16", description: "Room Charge", amount: 5750 },
      { date: "2026-06-17", description: "Room Charge", amount: 5750 },
      { date: "2026-06-17", description: "Laundry", amount: 450 },
      { date: "2026-06-18", description: "Room Charge", amount: 5750 },
      { date: "2026-06-18", description: "Mini Bar", amount: 380 },
      { date: "2026-06-18", description: "In Room Dining", amount: 1120 },
    ],
    subTotal: 19200,
    taxTotal: 2304,
    amount: 21504,
    paymentInstrument: "Guest CARD ****2288",
    paidBy: "Employee",
    occurredAt: "2026-06-19T11:05:00+05:30",
    currency: "INR",
  },
};

export function verifiedReading(filename: string): Extraction | null {
  return VERIFIED[path.basename(filename)] ?? null;
}

export async function readReceiptImage(imagePath: string): Promise<ReceiptReading> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const fallback = verifiedReading(imagePath);

  if (!key) {
    if (fallback) return { extracted: fallback, parsedBy: "rule", confidence: 0.95 };
    return {
      extracted: {},
      parsedBy: "rule",
      confidence: 0,
      error: "No GEMINI_API_KEY and no stored reading.",
    };
  }

  try {
    const bytes = await readFile(imagePath);
    const mime = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mime, data: bytes.toString("base64") } },
                { text: PROMPT },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(45000),
      },
    );

    if (!response.ok)
      throw new Error(`Gemini HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const json = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());

    return { extracted: normalise(json), parsedBy: "gemini", confidence: 0.9, raw: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (fallback) {
      return {
        extracted: fallback,
        parsedBy: "rule",
        confidence: 0.95,
        error: `Gemini unavailable (${message}); used the stored reading.`,
      };
    }
    return { extracted: {}, parsedBy: "rule", confidence: 0, error: message };
  }
}

/** Maps the model's JSON onto our Extraction shape, coercing every number. */
function normalise(json: Record<string, unknown>): Extraction {
  const num = (v: unknown) =>
    v === undefined || v === null ? undefined : (parseINR(String(v)) ?? undefined);
  const dateTime = (d: unknown, t?: unknown) => {
    const date = parseLooseDate(d ? String(d) : null);
    if (!date) return undefined;
    if (!t) return date.toISOString();
    const [h, m] = String(t).split(":");
    return new Date(
      `${String(d)}T${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+05:30`,
    ).toISOString();
  };

  const items = Array.isArray(json.lineItems) ? (json.lineItems as Record<string, unknown>[]) : [];

  return {
    merchant: json.merchant ? String(json.merchant) : undefined,
    city: json.city ? String(json.city) : undefined,
    billNo: json.billNo ? String(json.billNo) : undefined,
    invoiceNo: json.invoiceNo ? String(json.invoiceNo) : undefined,
    occurredAt: dateTime(json.date, json.time),
    covers: typeof json.covers === "number" ? json.covers : undefined,
    folioLines: items.map((i) => ({
      description: String(i.description ?? ""),
      amount: round2(Number(i.amount ?? 0)),
      date: i.date ? String(i.date) : undefined,
    })),
    subTotal: num(json.subTotal),
    taxTotal: num(json.taxTotal),
    serviceCharge: num(json.serviceCharge),
    amount: num(json.total),
    checkIn: dateTime(json.checkIn),
    checkOut: dateTime(json.checkOut),
    nights: typeof json.nights === "number" ? json.nights : undefined,
    tariffPerNight: num(json.tariffPerNight),
    paymentInstrument: json.paymentInstrument ? String(json.paymentInstrument) : undefined,
    paidBy: "Employee",
    currency: "INR",
  };
}
