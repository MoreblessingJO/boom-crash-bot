import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function userClient(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "select_agent",
  title: "Select an AI trading agent",
  description: "Set the signed-in user's active AI agent by slug (e.g. 'nicco', 'nexx', '007', 'sniper'). Fails if the agent is coming_soon.",
  inputSchema: { slug: z.string().min(1).describe("Agent slug from list_agents.") },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supa = userClient(ctx);
    const { data: agent, error: aerr } = await supa.from("agents").select("id, status, name").eq("slug", slug).maybeSingle();
    if (aerr) return { content: [{ type: "text", text: aerr.message }], isError: true };
    if (!agent) return { content: [{ type: "text", text: `Agent '${slug}' not found` }], isError: true };
    if (agent.status === "coming_soon") return { content: [{ type: "text", text: `${agent.name} is coming soon and cannot be selected yet.` }], isError: true };
    const { error } = await supa.from("user_agent_selections").upsert(
      { user_id: ctx.getUserId(), agent_id: agent.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Selected ${agent.name}` }], structuredContent: { agent_id: agent.id, name: agent.name } };
  },
});
