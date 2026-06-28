import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  symbol: z.string(),
  kind: z.enum(["boom", "crash"]),
  avgSpikeTicks: z.number(),
  ticksSinceSpike: z.number(),
  rsi: z.number(),
  emaFast: z.number(),
  emaSlow: z.number(),
  recentPrices: z.array(z.number()).max(60),
});

const SignalSchema = z.object({
  regime: z.enum(["spike-anticipation", "trend-following", "wait"]),
  direction: z.enum(["BUY", "SELL", "NONE"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(280),
});

export const aiSignal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `You are a hybrid trading agent for Deriv ${data.symbol} (${data.kind.toUpperCase()}).
Mean interval between spikes: ~${data.avgSpikeTicks} ticks. Boom spikes UP; Crash spikes DOWN.

State:
- ticks since last spike: ${data.ticksSinceSpike}
- RSI(14): ${data.rsi.toFixed(1)}
- EMA10: ${data.emaFast.toFixed(4)}, EMA30: ${data.emaSlow.toFixed(4)}
- last 30 prices: ${data.recentPrices.slice(-30).map((p) => p.toFixed(3)).join(", ")}

Pick ONE regime:
- "spike-anticipation": fade upcoming spike (Boom → SELL, Crash → BUY) when overdue.
- "trend-following": ride EMA/RSI momentum between spikes.
- "wait": no clean setup.

Return a JSON object with regime, direction (BUY/SELL/NONE), confidence (0-1), and a brief reason.`;

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      output: Output.object({ schema: SignalSchema }),
      prompt,
    });

    return output;
  });
