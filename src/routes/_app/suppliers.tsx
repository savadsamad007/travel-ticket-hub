import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";

export const Route = createFileRoute("/_app/suppliers")({
  component: () => (
    <PartyPage type="supplier" title="Suppliers" description="Airlines & ticket suppliers."
      statementBasePath="/statements" withOpeningBalance />
  ),
});
