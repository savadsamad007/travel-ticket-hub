import { createFileRoute } from "@tanstack/react-router";
import { PartyPage } from "@/components/skybird/party-page";

export const Route = createFileRoute("/_app/sub-agents")({
  component: () => (
    <PartyPage type="sub_agent" title="Sub-agents" description="Resellers buying tickets through you."
      statementBasePath="/statements" withOpeningBalance />
  ),
});
