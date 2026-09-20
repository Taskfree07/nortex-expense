/** Money helpers. Everything is INR and is rounded to paise at every boundary. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parses "INR 1,415.02", "1,229.00", "INR 20,000.00" -> number. */
export function parseINR(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? round2(raw) : null;
  const cleaned = raw
    .replace(/(INR|₹|Rs\.?)/gi, "")
    .replace(/,/g, "")
    .trim();
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? round2(n) : null;
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Splits a shared tax pool across a component, pro rata on its value. */
export function taxShare(component: number, subTotal: number, taxTotal: number): number {
  if (!subTotal) return 0;
  return round2((component / subTotal) * taxTotal);
}
