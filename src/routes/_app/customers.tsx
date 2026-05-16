import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";

export const Route = createFileRoute("/_app/customers")({
  component: () => (
    <PartyPage type="customer" title="Customers" description="Walk-in customers buying tickets."
      statementBasePath="/statements" withOpeningBalance={false} />
  ),
});
