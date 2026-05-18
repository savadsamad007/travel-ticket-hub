import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";
import { RequirePerm } from "@/components/skybird/require-perm";

export const Route = createFileRoute("/_app/suppliers")({
  component: () => (
    <RequirePerm perm="suppliers">
      <PartyPage type="supplier" title="Suppliers" description="Airlines & ticket suppliers."
        statementBasePath="/statements" withOpeningBalance />
    </RequirePerm>
  ),
});
