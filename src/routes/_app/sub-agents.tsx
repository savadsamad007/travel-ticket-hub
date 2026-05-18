import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";
import { RequirePerm } from "@/components/skybird/require-perm";

export const Route = createFileRoute("/_app/sub-agents")({
  component: () => (
    <RequirePerm perm="sub_agents">
      <PartyPage type="sub_agent" title="Sub-agents" description="Resellers buying tickets through you."
        statementBasePath="/statements" withOpeningBalance />
    </RequirePerm>
  ),
});
