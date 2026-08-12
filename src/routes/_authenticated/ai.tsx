import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useEffect } from "react";
import { AppShell, Panel } from "@/components/app/AppShell";
import { askMaxx } from "@/lib/maxx.functions";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "Maxx AI Command Center — NexxTrade" },
      { name: "description", content: "Ask Maxx AI which agent fits your risk, how your strategies are performing, and what to adjust next." },
      { property: "og:title", content: "Maxx AI Command Center — NexxTrade" },
      { property: "og:description", content: "Your AI trading co-pilot: agent selection, performance reviews and risk guidance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "How are my agents performing this week?",
  "Which agent fits a low-risk profile?",
  "Explain Nicco's strategy in simple terms",
  "Am I ready to go live with real funds?",
];

function AiPage() {
  const ask = useServerFn(askMaxx);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (next: Msg[]) => ask({ data: { messages: next } }),
    onSuccess: (r) => setMessages((m) => [...m, { role: "assistant", content: r.reply }]),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Maxx is unavailable right now"),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || send.isPending) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    send.mutate(next);
  }

  return (
    <AppShell title="Maxx AI" subtitle="Your autonomous trading co-pilot">
      {messages.length === 0 && (
        <>
          <Panel className="relative overflow-hidden text-center">
            <div className="orb mx-auto h-24 w-24 rounded-full" />
            <h2 className="mt-4 text-xl font-bold">How can I help you trade smarter?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              I read your live agent performance and risk profile before answering.
            </p>
          </Panel>
          <div className="grid gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => submit(q)}
                className="card-soft flex items-center gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5 text-left text-sm font-medium transition hover:border-primary"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                {q}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-[20px] px-4 py-3 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "card-soft border border-border bg-card",
            )}
          >
            {m.content}
          </div>
        ))}
        {send.isPending && (
          <div className="card-soft flex w-fit items-center gap-2 rounded-[20px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Maxx is thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="glass fixed bottom-[72px] left-1/2 z-30 w-full max-w-xl -translate-x-1/2 border-t border-border px-5 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Maxx anything…"
            className="h-12 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" className="h-12 w-12 shrink-0 rounded-full" disabled={send.isPending}>
            <Send className="h-4.5 w-4.5" />
          </Button>
        </div>
      </form>
      <div className="h-16" />
    </AppShell>
  );
}
