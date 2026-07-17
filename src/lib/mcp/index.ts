import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAgents from "./tools/list-agents";
import getMyAgent from "./tools/get-my-agent";
import selectAgent from "./tools/select-agent";
import getMyDerivConnection from "./tools/get-my-deriv-connection";
import getMyProfile from "./tools/get-my-profile";

// See knowledge://app-mcp-server-authoring — issuer must be the direct Supabase host.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nexxtrade-mcp",
  title: "NexxTrade",
  version: "0.1.0",
  instructions:
    "Tools for the signed-in NexxTrade user. Use `list_agents` to browse AI trading agents, `get_my_agent` / `select_agent` to view or change the active agent, `get_my_deriv_connection` to inspect the linked Deriv account, and `get_my_profile` for basic identity. All tools act as the authenticated user under Row-Level Security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAgents, getMyAgent, selectAgent, getMyDerivConnection, getMyProfile],
});
