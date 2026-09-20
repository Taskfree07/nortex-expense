/** Date helpers. The pack is India-based, so everything is read as IST. */

const IST_OFFSET = "+05:30";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Reads "18-Jun-2026", "18 Jun 2026", "Tue, 16 Jun 2026", "2026-06-16". */
export function parseLooseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = input.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00${IST_OFFSET}`);

  const dmy = s.match(/(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})/);
  if (dmy) {
    const month = MONTHS[dmy[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const day = String(Number(dmy[1])).padStart(2, "0");
      const mm = String(month + 1).padStart(2, "0");
      return new Date(`${dmy[3]}-${mm}-${day}T00:00:00${IST_OFFSET}`);
    }
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Reads a date plus a clock time, e.g. ("16 Jun 2026", "05:20 AM"). */
export function parseLooseDateTime(datePart: string, timePart?: string | null): Date | null {
  const base = parseLooseDate(datePart);
  if (!base || !timePart) return base;
  const m = timePart.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return base;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  // The calendar day must be read back in IST: midnight IST is the previous day
  // in UTC, so taking it off toISOString() would date every receipt a day early.
  return new Date(
    `${ymd(base)}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00${IST_OFFSET}`,
  );
}

export function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/** Inclusive whole-day count. 16 Jun to 20 Jun is 5 days - travel days count in full. */
export function inclusiveDays(from: Date, to: Date): number {
  const a = new Date(`${ymd(from)}T00:00:00${IST_OFFSET}`).getTime();
  const b = new Date(`${ymd(to)}T00:00:00${IST_OFFSET}`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/** Policy 5.4 - Finance pays on the 10th and the 25th. */
export function nextPaymentRun(from: Date): Date {
  const day = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" }).format(from),
  );
  const month = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "numeric" }).format(from),
  );
  const year = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(from),
  );
  if (day <= 10) return new Date(`${year}-${String(month).padStart(2, "0")}-10T00:00:00${IST_OFFSET}`);
  if (day <= 25) return new Date(`${year}-${String(month).padStart(2, "0")}-25T00:00:00${IST_OFFSET}`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-10T00:00:00${IST_OFFSET}`);
}
