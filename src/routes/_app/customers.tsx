import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";
import { RequirePerm } from "@/components/skybird/require-perm";

export const Route = createFileRoute("/_app/customers")({
  component: () => (
    <RequirePerm perm="customers">
      <PartyPage type="customer" title="Customers" description="Walk-in customers buying tickets."
        statementBasePath="/statements" withOpeningBalance={false} />
    </RequirePerm>
  ),
});
