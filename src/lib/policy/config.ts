/**
 * NTX-HR-POL-11 Rev 4, effective 01 Apr 2026, expressed as data.
 * Every number here is traceable to a clause in data/pack/expense_policy.md.
 */

export type CityClass = "TIER_1" | "TIER_2" | "TIER_3";

export const TIER_1_CITIES = [
  "bengaluru", "bangalore", "mumbai", "delhi", "new delhi", "delhi ncr", "gurgaon",
  "gurugram", "noida", "hyderabad", "chennai", "pune", "kolkata",
];

export const TIER_2_CITIES = [
  "ahmedabad", "jaipur", "lucknow", "chandigarh", "kochi", "coimbatore", "indore",
  "nagpur", "bhubaneswar", "visakhapatnam", "surat", "vadodara", "mysuru", "mysore",
];

/** Policy 3.1 - lodging, per night, on the room tariff excluding taxes. */
export const LODGING_CAP: Record<CityClass, number> = {
  TIER_1: 6000,
  TIER_2: 4000,
  TIER_3: 2800,
};

/** Policy 3.3 - meals, per full day. Travel days count as full days. */
export const MEAL_CAP: Record<CityClass, number> = {
  TIER_1: 1500,
  TIER_2: 1000,
  TIER_3: 1000,
};

/** Policy 3.3 - a meal claim above this needs a bill. */
export const MEAL_BILL_THRESHOLD = 500;

/** Policy 3.5 - business entertainment above this needs prior HoD approval. */
export const ENTERTAINMENT_PRIOR_APPROVAL_ABOVE = 2000;

/** Policy 1.2 - advance ceiling, as a share of the employee-borne estimate. */
export const ADVANCE_CAP_RATIO = 0.6;

/** Policy 5.1 - calendar days from return to submit the settlement. */
export const SUBMISSION_WINDOW_DAYS = 7;

/** Policy 2 - the approval matrix, read bottom-up against the claimed value. */
export const APPROVAL_MATRIX = [
  { upTo: 25000, roles: ["Reporting Manager"] },
  { upTo: 75000, roles: ["Reporting Manager", "Head of Department"] },
  { upTo: 200000, roles: ["Reporting Manager", "Head of Department", "Head of Division"] },
  { upTo: Infinity, roles: ["Reporting Manager", "Head of Department", "Head of Division", "MD"] },
] as const;

/** Policy 4 - never reimbursed, even when buried in a consolidated bill. */
export const NON_REIMBURSABLE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /laundry|dry\s*clean/i, label: "Laundry" },
  { pattern: /mini\s*bar|minibar/i, label: "Mini bar" },
  { pattern: /in[-\s]?room entertainment|pay per view|movie/i, label: "In-room entertainment" },
  { pattern: /\bspa\b|massage/i, label: "Spa" },
  { pattern: /\bgym\b|fitness cent/i, label: "Gym" },
  { pattern: /personal (phone|call|data)|telephone charges|internet usage/i, label: "Personal phone or data" },
  { pattern: /\balcohol\b|\bliquor\b|\bbeer\b|\bwine\b|\bwhisky\b|\bvodka\b|\brum\b|\bbar\b(?!\s*code)/i, label: "Alcohol" },
  { pattern: /\bfine\b|penalty|challan/i, label: "Fine or penalty" },
  { pattern: /travel insurance/i, label: "Travel insurance" },
];

/** Hotel folio lines that are food rather than lodging: moved to the meal head. */
export const FOLIO_MEAL_PATTERNS = [/in[-\s]?room dining|room service|restaurant|breakfast|f\s*&\s*b/i];

export function classifyCity(city: string | null | undefined): CityClass {
  const c = (city ?? "").toLowerCase();
  if (TIER_1_CITIES.some((t) => c.includes(t))) return "TIER_1";
  if (TIER_2_CITIES.some((t) => c.includes(t))) return "TIER_2";
  return "TIER_3";
}

export function matchNonReimbursable(description: string): string | null {
  for (const { pattern, label } of NON_REIMBURSABLE_PATTERNS) {
    if (pattern.test(description)) return label;
  }
  return null;
}

export function isFolioMeal(description: string): boolean {
  return FOLIO_MEAL_PATTERNS.some((p) => p.test(description));
}

/** Policy 2 - which roles must sign off on a value. International always adds MD. */
export function requiredApprovalRoles(value: number, international = false): string[] {
  const band = APPROVAL_MATRIX.find((b) => value <= b.upTo) ?? APPROVAL_MATRIX[APPROVAL_MATRIX.length - 1];
  const roles = [...band.roles];
  if (international) {
    for (const r of ["Reporting Manager", "Head of Department", "Head of Division", "MD"]) {
      if (!roles.includes(r as never)) roles.push(r as never);
    }
  }
  return roles as string[];
}
