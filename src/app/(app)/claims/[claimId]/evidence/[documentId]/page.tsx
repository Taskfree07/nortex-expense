import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { CLASSIFICATION_LABEL } from "@/lib/ui";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PageHeader, Panel, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * One piece of evidence, shown beside what the reader made of it. This is the
 * page that answers "where did this number come from?".
 */
export default async function EvidencePage({
  params,
}: PageProps<"/claims/[claimId]/evidence/[documentId]">) {
  const { claimId, documentId } = await params;
  await requireActor();

  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: { claimLines: true },
  });
  if (!doc) notFound();

  const extracted = JSON.parse(doc.extractedJson) as Record<string, unknown>;
  const fields = Object.entries(extracted).filter(
    ([, value]) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0),
  );

  return (
    <>
      <PageHeader
        title={doc.subject || doc.filename}
        lede={`${doc.fromAddr} · ${doc.sentAt ? formatDateTime(doc.sentAt) : "no date"}`}
        actions={
          <>
            <Pill tone={doc.excluded ? "amber" : "moss"}>{doc.excluded ? "Set aside" : "Claimed"}</Pill>
            <Link href={`/claims/${claimId}#evidence`} className="text-sm text-stamp hover:underline">
              Back to the claim
            </Link>
          </>
        }
      />

      {doc.excluded ? (
        <p className="mb-6 border-l-2 border-amber bg-amber-wash px-4 py-3 text-sm text-ink">
          {doc.excludeReason}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="What arrived"
          hint={`Read by ${doc.parsedBy === "gemini" ? "Gemini" : "the rule for this sender"}.`}
        >
          {doc.imagePath ? (
            <div className="border-b border-rule bg-paper p-4">
              <Image
                src={`/api/documents/${doc.id}/image`}
                alt={`Bill attached to ${doc.subject}`}
                width={700}
                height={900}
                className="mx-auto h-auto w-full max-w-md border border-rule bg-card"
                unoptimized
              />
            </div>
          ) : null}
          <pre className="max-h-[32rem] overflow-auto px-5 py-4 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
            {doc.rawText}
          </pre>
        </Panel>

        <div className="space-y-6">
          <Panel title="What the reader made of it">
            <dl className="divide-y divide-rule">
              <Row label="Read as" value={CLASSIFICATION_LABEL[doc.classification] ?? doc.classification} />
              <Row label="Confidence" value={`${Math.round(doc.confidence * 100)}%`} />
              {fields.map(([key, value]) => (
                <Row key={key} label={humanField(key)} value={renderValue(key, value)} />
              ))}
              {doc.fingerprint ? <Row label="Reconciliation key" value={doc.fingerprint} mono /> : null}
            </dl>
          </Panel>

          {doc.claimLines.length > 0 ? (
            <Panel title="What it became on the claim">
              <ul className="divide-y divide-rule">
                {doc.claimLines.map((line) => (
                  <li key={line.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
                    <div>
                      <div className="text-sm text-ink">{line.description}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">{line.head}</div>
                    </div>
                    <div className="num text-sm text-ink">{formatINR(line.allowed)}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`max-w-[60%] text-right text-sm text-ink ${mono ? "ident" : ""}`}>{value}</dd>
    </div>
  );
}

function humanField(key: string) {
  return (
    {
      merchant: "Merchant",
      amount: "Total",
      occurredAt: "When",
      pickup: "From",
      drop: "To",
      hotel: "Hotel",
      checkIn: "Check in",
      checkOut: "Check out",
      nights: "Nights",
      tariffPerNight: "Tariff per night",
      roomCharges: "Room charges",
      subTotal: "Sub total",
      taxTotal: "Tax",
      invoiceNo: "Invoice number",
      billNo: "Bill number",
      covers: "Covers",
      paidBy: "Borne by",
      paymentInstrument: "Paid with",
      folioLines: "Line items",
      sectors: "Sectors",
      pnr: "PNR",
      cabinClass: "Class",
      advanceRef: "Advance reference",
      riderName: "Rider",
      notes: "Notes",
      currency: "Currency",
      city: "City",
      serviceCharge: "Service charge",
      attendeeOrg: "Organisation",
    }[key] ?? key
  );
}

function renderValue(key: string, value: unknown): string {
  if (typeof value === "number") {
    return ["amount", "subTotal", "taxTotal", "tariffPerNight", "roomCharges", "serviceCharge"].includes(
      key,
    )
      ? formatINR(value)
      : String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "description" in item) {
          const line = item as { description: string; amount: number };
          return `${line.description} ${formatINR(line.amount)}`;
        }
        if (item && typeof item === "object" && "from" in item) {
          const sector = item as { from: string; to: string; total: number };
          return `${sector.from} to ${sector.to} ${formatINR(sector.total)}`;
        }
        return String(item);
      })
      .join(" · ");
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  return String(value);
}
