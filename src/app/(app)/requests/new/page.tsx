import { PageHeader } from "@/components/ui";
import { RequestForm } from "@/components/request-form";

export const dynamic = "force-dynamic";

export default function NewRequestPage() {
  return (
    <>
      <PageHeader
        title="Raise a travel request"
        lede="Policy 1.1: travel needs an approved request before anything is booked. The request gets an ID, and every booking, bill and payment afterwards is tracked against it."
      />
      <RequestForm />
    </>
  );
}
