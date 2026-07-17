import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_my_profile",
  title: "Get my profile",
  description: "Return the signed-in user's basic identity (user id, email) as seen by NexxTrade.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const profile = { user_id: ctx.getUserId(), email: ctx.getUserEmail() ?? null };
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }], structuredContent: profile };
  },
});
