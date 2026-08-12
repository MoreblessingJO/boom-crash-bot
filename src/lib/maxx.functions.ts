// Maxx AI — conversational command centre for the signed-in user.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(24),
});

export const askMaxx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured yet.");

    const [{ data: perf }, { data: risk }, { data: sel }] = await Promise.all([
      context.supabase.from("agent_performance" as never).select("*"),
      context.supabase
        .from("user_risk_profiles" as never)
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("user_agent_selections")
        .select("agent_id, agents(name, slug, tagline)")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const provider = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: provider("google/gemini-3-flash-preview"),
      system: [
        "You are Maxx, the AI trading co-pilot inside NexxTrade.",
        "NexxTrade runs autonomous AI agents (Nicco, Agent Nexx, Agent 007, Sniper) on Deriv Boom & Crash synthetics; crypto and forex are coming soon.",
        "Be concise, warm and concrete. Use short paragraphs or tight bullet lists. Never promise returns.",
        "Always frame risk honestly and remind the user that trading involves substantial risk when they ask about going live or sizing up.",
        "You cannot place trades directly — you advise, explain performance, and suggest which agent or risk setting fits.",
        `User risk profile: ${risk ? JSON.stringify(risk) : "not completed yet"}.`,
        `Selected agent: ${sel ? JSON.stringify(sel) : "none selected"}.`,
        `Live agent performance snapshot: ${JSON.stringify(perf ?? [])}.`,
      ].join("\n"),
      messages: data.messages,
      maxRetries: 2,
    });

    return { reply: text };
  });
